//! The app's macOS runner: the release runner of `nsh package`, plus hot updates. It opens the bundle
//! shipped in the app, and swaps in a verified package when `Updater.activate` asks (on the main thread).

use std::cell::RefCell;
use std::process::ExitCode;
use std::rc::Rc;

use nsh_app_discoveryos::update;
use nsh_platform_macos::objc2::{MainThreadMarker, MainThreadOnly};
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
    // SAFETY: the embedded bytecode is a resource of this app bundle, covered by its signature.
    let bundle = match unsafe { Bundle::read_trusted(&dir.join("bundle.nshc")) } {
        Ok(bundle) => bundle,
        Err(err) => {
            eprintln!("cannot read the app bundle in {}: {err}", dir.display());
            return ExitCode::FAILURE;
        }
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

/// Runs on the main thread: verifies the package again, builds its bundle, and swaps the view.
fn swap(bytes: Vec<u8>) {
    match update::bundle_from_package(&bytes) {
        Ok(bundle) => VIEW.with(|slot| {
            if let Some(view) = slot.borrow().as_ref() {
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
