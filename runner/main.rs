//! The app's macOS runner: the release runner of `nsh package`, plus hot updates. It opens the bundle
//! shipped in the app, and swaps in a verified package when `Updater.activate` asks (on the main thread).

use std::cell::RefCell;
use std::process::ExitCode;
use std::rc::Rc;

use nsh_app_discoveryos::update;
use nsh_platform_macos::objc2::rc::Retained as Owned;
use nsh_platform_macos::objc2::runtime::AnyObject;
use nsh_platform_macos::objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly};
use nsh_platform_macos::objc2_app_kit::{NSMenu, NSMenuItem};
use nsh_platform_macos::objc2_foundation::{NSAttributedString, NSMutableDictionary, NSObject, NSObjectProtocol};
use nsh_platform_macos::objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSWindow, NSWindowStyleMask,
};
use nsh_platform_macos::objc2_foundation::{NSOperationQueue, NSPoint, NSRect, NSSize, NSString};
use nsh_platform_macos::{App, AppOptions, AppView, AssetBase, Bundle, Limits};

thread_local! {
    // Main thread only: the window's view, which an update swaps the app in.
    static VIEW: RefCell<Option<Rc<AppView>>> = const { RefCell::new(None) };
}

fn main() -> ExitCode {
    nsh_platform_macos::set_ui_sets(vec![nsh_base::registry(), set_discoveryos()]);

    let Some(mtm) = MainThreadMarker::new() else {
        eprintln!("DiscoveryOS must run on the main thread");
        return ExitCode::FAILURE;
    };
    // `DiscoveryOS.app/Contents/MacOS/DiscoveryOS` -> `DiscoveryOS.app/Contents/Resources/nsh`.
    let dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.canonicalize().ok())
        .and_then(|exe| Some(exe.parent()?.parent()?.join("Resources/nsh")))
        .unwrap_or_default();
    // The package kept from an earlier update when it still verifies, else the bundle shipped in the app.
    let bundle = match update::startup_package() {
        Some((bundle, build)) => {
            update::ACTIVE_BUILD.store(build, std::sync::atomic::Ordering::SeqCst);
            bundle
        }
        // SAFETY: the embedded bytecode is a resource of this app bundle, covered by its signature.
        None => match unsafe { Bundle::read_trusted(&dir.join("bundle.nshc")) } {
            Ok(bundle) => bundle,
            Err(err) => {
                eprintln!("cannot read the app bundle in {}: {err}", dir.display());
                return ExitCode::FAILURE;
            }
        },
    };
    let options = AppOptions {
        asset_base: Some(AssetBase::Directory(dir.join("assets"))),
        limits: Limits::standalone(),
        title: "DiscoveryOS".into(),
        app_id: "com.nickr.DiscoveryOS".into(),
        ..AppOptions::default()
    };

    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
    let frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1200.0, 800.0));
    let style = NSWindowStyleMask::Titled
        | NSWindowStyleMask::Closable
        | NSWindowStyleMask::Miniaturizable
        | NSWindowStyleMask::Resizable;
    // SAFETY: NSWindow's designated initializer.
    let window = unsafe {
        NSWindow::initWithContentRect_styleMask_backing_defer(
            NSWindow::alloc(mtm),
            frame,
            style,
            NSBackingStoreType::Buffered,
            false,
        )
    };
    // SAFETY: the window lives in this function until the app quits.
    unsafe { window.setReleasedWhenClosed(false) };
    window.setTitle(&NSString::from_str("DiscoveryOS"));

    let view = AppView::new(mtm, options);
    window.setContentView(Some(&view.view()));
    window.center();
    view.load(App::Js(bundle));
    window.makeKeyAndOrderFront(None);
    app.activate();

    install_menu(mtm, &app);

    VIEW.with(|slot| *slot.borrow_mut() = Some(view));
    let _ = update::ACTIVATE.set(Box::new(|bytes: Vec<u8>| {
        // The JS thread asks; the swap runs on the main queue, where AppKit may be used.
        let block = block2::RcBlock::new(move || swap(bytes.clone()));
        // SAFETY: the block runs on the main queue and owns its data.
        unsafe { NSOperationQueue::mainQueue().addOperationWithBlock(&block) };
    }));

    app.run();
    ExitCode::SUCCESS
}

define_class!(
    /// Target of the About menu item: shows the standard About panel with the app's build details.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "DiscoveryOSAboutTarget"]
    struct AboutTarget;

    unsafe impl NSObjectProtocol for AboutTarget {}

    impl AboutTarget {
        #[unsafe(method(showAbout:))]
        fn show_about(&self, _sender: Option<&AnyObject>) {
            show_about_panel(self.mtm());
        }
    }
);

/// The menu bar: the app menu with About and Quit (this runner replaces the stock menu).
fn install_menu(mtm: MainThreadMarker, app: &NSApplication) {
    let target: Owned<AboutTarget> = {
        let this = mtm.alloc::<AboutTarget>();
        let this = this.set_ivars(());
        unsafe { msg_send![super(this), init] }
    };
    // Kept for the life of the app: the menu item only holds it weakly.
    std::mem::forget(target.clone());

    let bar = NSMenu::new(mtm);
    let app_item = NSMenuItem::new(mtm);
    let menu = NSMenu::new(mtm);
    let about = unsafe {
        NSMenuItem::initWithTitle_action_keyEquivalent(
            NSMenuItem::alloc(mtm),
            &NSString::from_str("About DiscoveryOS"),
            Some(sel!(showAbout:)),
            &NSString::from_str(""),
        )
    };
    unsafe { about.setTarget(Some(&target)) };
    menu.addItem(&about);
    menu.addItem(&NSMenuItem::separatorItem(mtm));
    let quit = unsafe {
        NSMenuItem::initWithTitle_action_keyEquivalent(
            NSMenuItem::alloc(mtm),
            &NSString::from_str("Quit DiscoveryOS"),
            Some(sel!(terminate:)),
            &NSString::from_str("q"),
        )
    };
    menu.addItem(&quit);
    app_item.setSubmenu(Some(&menu));
    bar.addItem(&app_item);
    app.setMainMenu(Some(&bar));
}

/// The standard About panel, with the running build and the kept package's details as its credits.
fn show_about_panel(mtm: MainThreadMarker) {
    let info = update::about_json();
    let text = |key: &str| info[key].as_str().unwrap_or_default().to_string();
    let build = info["runningBuild"].as_u64().unwrap_or(0);
    let source = if info["runningSource"] == "package" { "update package" } else { "embedded" };
    let mut lines = vec![
        format!("Running build {build} ({source})"),
        format!("Embedded: {} · build {}", text("embeddedVersion"), info["embeddedBuild"]),
    ];
    if let Some(pkg) = info["package"].as_object() {
        let time = |key: &str| {
            pkg.get(key)
                .and_then(|v| v.as_i64())
                .filter(|&t| t > 0)
                .map_or("—".to_string(), |t| format_utc(t))
        };
        lines.push(format!(
            "Package: {} · build {}",
            pkg.get("version").and_then(|v| v.as_str()).unwrap_or("?"),
            pkg.get("build").and_then(|v| v.as_u64()).unwrap_or(0)
        ));
        lines.push(format!("Signed: {}", time("signedAt")));
        lines.push(format!("Accepted: {}", time("acceptedAt")));
        lines.push(format!("Key: {}", pkg.get("keyId").and_then(|v| v.as_str()).unwrap_or("?")));
        let sha = pkg.get("sha256").and_then(|v| v.as_str()).unwrap_or("");
        lines.push(format!("SHA-256: {}…", &sha[..sha.len().min(16)]));
    } else if info["pendingSwap"].as_bool().unwrap_or(false) {
        lines.push("Package: swapped in, waiting for the health check".to_string());
    }
    let last = text("lastCheck");
    lines.push(format!("Last check: {}", if last.is_empty() { "not yet" } else { &last }));

    let credits = NSAttributedString::from_nsstring(&NSString::from_str(&lines.join("\n")));
    let version = text("runningVersion");
    let options = NSMutableDictionary::<NSString, AnyObject>::new();
    put(&options, "ApplicationName", &NSString::from_str("DiscoveryOS"));
    put(&options, "ApplicationVersion", &NSString::from_str(&version));
    put(&options, "Version", &NSString::from_str(&build.to_string()));
    put(&options, "Credits", &credits);
    let app = NSApplication::sharedApplication(mtm);
    unsafe { app.orderFrontStandardAboutPanelWithOptions(&options) };
}

/// Sets `key` to `value` in the About panel's options.
fn put(options: &NSMutableDictionary<NSString, AnyObject>, key: &str, value: &AnyObject) {
    let key = NSString::from_str(key);
    options.insert(&*key, value);
}

/// `2026-11-10 08:56 UTC` for Unix seconds.
fn format_utc(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let secs = seconds.rem_euclid(86_400);
    // Civil-from-days (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02} {:02}:{:02} UTC", secs / 3600, (secs % 3600) / 60)
}

/// Runs on the main thread: verifies the package again, builds its bundle, and swaps the view.
fn swap(bytes: Vec<u8>) {
    match update::bundle_from_package(&bytes) {
        Ok((bundle, build)) => VIEW.with(|slot| {
            if let Some(view) = slot.borrow().as_ref() {
                update::ACTIVE_BUILD.store(build, std::sync::atomic::Ordering::SeqCst);
                view.load(App::Js(bundle));
            }
        }),
        Err(err) => eprintln!("update refused: {err}"),
    }
}

#[allow(non_snake_case)]
fn set_discoveryos() -> nsh_core::element::Registry {
    use nsh_app_discoveryos::*;
    __nsh_native_module()
}
