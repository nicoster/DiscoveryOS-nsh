//! The app's Linux runner: the release runner of a packaged app, plus hot updates. It opens the bundle shipped in
//! the app (`nsh/bundle.nshc`, next to the executable), and swaps in a verified package when `Updater.activate`
//! asks, on the GTK main thread. Mirrors `nsh_linux_app::main` and `nsh_platform_linux::run_app`, which do not
//! allow a hook for the swap.

use std::cell::RefCell;
use std::path::PathBuf;
use std::process::ExitCode;
use std::rc::Rc;

use nsh_app_discoveryos::update;
use nsh_platform_linux::gtk4::{self as gtk, gio, glib, prelude::*};
use nsh_platform_linux::{App, AppOptions, AppView, Appearance, AssetBase, Bundle, Limits};

thread_local! {
    // GTK main thread only: the view, which an update swaps the app in, and its window, which keeps it alive.
    static VIEW: RefCell<Option<Rc<AppView>>> = const { RefCell::new(None) };
    static WINDOW: RefCell<Option<gtk::ApplicationWindow>> = const { RefCell::new(None) };
}

/// Prints the app's logs to stderr: the JS `console` (target `js`), uncaught JS errors, warnings and errors, and the
/// update's messages. Without a logger installed, the `log` facade drops them.
struct StderrLogger;

impl log::Log for StderrLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.level() <= log::Level::Warn || metadata.target() == "js"
    }

    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) {
            eprintln!("{} {}: {}", record.level(), record.target(), record.args());
        }
    }

    fn flush(&self) {}
}

static LOGGER: StderrLogger = StderrLogger;

fn main() -> ExitCode {
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Info);
    nsh_platform_linux::set_ui_sets(vec![nsh_base::registry(), set_discoveryos()]);

    // The package directory: `nsh` next to the executable (or `NSH_APP_DIR`, as `nsh run` sets it).
    let dir = match std::env::var_os("NSH_APP_DIR") {
        Some(dir) => PathBuf::from(dir),
        None => std::env::current_exe()
            .and_then(|exe| exe.canonicalize())
            .ok()
            .and_then(|exe| exe.parent().map(|d| d.join("nsh")))
            .unwrap_or_default(),
    };
    let options = app_options(&dir);

    // The package kept from an earlier update when it still verifies, else the bundle shipped in the app.
    let bundle = match update::startup_package() {
        Some((bundle, build)) => {
            update::ACTIVE_BUILD.store(build, std::sync::atomic::Ordering::SeqCst);
            bundle
        }
        // SAFETY: the bytecode is a resource of this app's own package.
        None => match unsafe { Bundle::read_trusted(&dir.join("bundle.nshc")) } {
            Ok(bundle) => bundle,
            Err(err) => {
                log::error!("cannot read the app bundle in {}: {err}", dir.display());
                return ExitCode::FAILURE;
            }
        },
    };

    // The swap runs on the GTK main thread: the JS thread asks, and the idle callback does the work there.
    let _ = update::ACTIVATE.set(Box::new(|bytes: Vec<u8>| {
        glib::idle_add_once(move || swap(bytes));
    }));

    prefer_gl_on_nvidia();
    // X11's WM_CLASS comes from the program name: the app's id (the `StartupWMClass` of its `.desktop` file).
    glib::set_prgname(Some(&options.app_id));
    let app = gtk::Application::builder()
        .application_id(&options.app_id)
        .flags(gio::ApplicationFlags::NON_UNIQUE)
        .build();
    let quit = gio::SimpleAction::new("quit", None);
    {
        let weak = app.downgrade();
        quit.connect_activate(move |_, _| {
            if let Some(app) = weak.upgrade() {
                app.quit();
            }
        });
    }
    app.add_action(&quit);
    app.set_accels_for_action("app.quit", &["<Primary>q"]);

    let bundle = RefCell::new(Some(bundle));
    let title = options.title.clone();
    let size = options.size;
    app.connect_activate(move |app| {
        let Some(bundle) = bundle.borrow_mut().take() else {
            return;
        };
        let window = gtk::ApplicationWindow::builder()
            .application(app)
            .title(&title)
            .default_width(size.0)
            .default_height(size.1)
            .build();
        let view = AppView::new(options.clone());
        window.set_child(Some(&view.widget()));
        view.load(App::Js(bundle));
        window.present();
        VIEW.with(|slot| *slot.borrow_mut() = Some(view));
        WINDOW.with(|slot| *slot.borrow_mut() = Some(window));
    });

    // GTK must not parse the host's own arguments.
    let code = app.run_with_args::<&str>(&[]);
    if code == glib::ExitCode::SUCCESS {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

/// The window's options from the package: its assets, name, id and appearance (`app.json`).
fn app_options(dir: &std::path::Path) -> AppOptions {
    let mut options = AppOptions {
        asset_base: Some(AssetBase::Directory(dir.join("assets"))),
        // The platform's default is a phone's size (390x844); the app is a desktop window, as on macOS.
        size: (1200, 800),
        // An app on its own, not a module embedded in another app.
        limits: Limits::standalone(),
        ..AppOptions::default()
    };
    let info = std::fs::read_to_string(dir.join("app.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
    let field = |key: &str| {
        info.as_ref()
            .and_then(|info| info.get(key)?.as_str().map(str::to_owned))
    };
    if let Some(id) = field("id") {
        options.app_id = id;
    }
    if let Some(name) = field("name") {
        options.title = name;
    }
    match field("appearance").as_deref() {
        Some("light") => options.appearance = Appearance::Light,
        Some("dark") => options.appearance = Appearance::Dark,
        _ => {}
    }
    options
}

/// Runs on the GTK main thread: verifies the package again, builds its bundle, and swaps the view.
fn swap(bytes: Vec<u8>) {
    match update::bundle_from_package(&bytes) {
        Ok((bundle, build)) => VIEW.with(|slot| {
            if let Some(view) = slot.borrow().as_ref() {
                update::ACTIVE_BUILD.store(build, std::sync::atomic::Ordering::SeqCst);
                view.load(App::Js(bundle));
            }
        }),
        Err(err) => log::warn!("update refused: {err}"),
    }
}

/// Draws with GSK's GL renderer instead of Vulkan under NVIDIA's driver (as `nsh_platform_linux` does), unless
/// `GSK_RENDERER` chooses.
fn prefer_gl_on_nvidia() {
    if std::env::var_os("GSK_RENDERER").is_some()
        || !std::path::Path::new("/proc/driver/nvidia/version").exists()
    {
        return;
    }
    // SAFETY: called before GTK starts, while this is the process' only thread reading the environment.
    unsafe { std::env::set_var("GSK_RENDERER", "ngl") };
}

#[allow(non_snake_case)]
fn set_discoveryos() -> nsh_core::element::Registry {
    use nsh_app_discoveryos::*;
    __nsh_native_module()
}
