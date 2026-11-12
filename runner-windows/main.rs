//! The app's Windows runner: the release runner of a packaged app, plus hot updates. It opens the bundle shipped in
//! the app (`nsh\bundle.nshc`, next to the executable), and swaps in a verified package when `Updater.activate` asks.
//! The swap runs on the window's thread: the JS thread posts a message to the window, and its subclass handles it.
//!
//! `nsh_platform_windows::run_app` does not give the window, so this mirrors its steps (on a thread of its own, with
//! the same stack size) and runs the message loop itself.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::rc::Rc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicIsize, Ordering};

use nsh_app_discoveryos::update;
use nsh_platform_windows::windows::core::HSTRING;
use nsh_platform_windows::windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use nsh_platform_windows::windows::Win32::System::Ole::{OleInitialize, OleUninitialize};
use nsh_platform_windows::windows::Win32::UI::HiDpi::{
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext,
};
use nsh_platform_windows::windows::Win32::UI::Shell::{
    DefSubclassProc, SetCurrentProcessExplicitAppUserModelID, SetWindowSubclass,
};
use nsh_platform_windows::windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, MSG, PostMessageW, TranslateMessage, WM_APP,
};
use nsh_platform_windows::{
    App, AppOptions, AppView, Appearance, AssetBase, Bundle, Limits, debug_output, fatal_error,
};

/// The window's message that asks it to swap in the packages in `PENDING`.
const WM_NSH_SWAP: u32 = WM_APP + 0x100;

/// Packages handed over by `Updater.activate` (any thread), swapped in on the window's thread.
static PENDING: Mutex<Vec<Vec<u8>>> = Mutex::new(Vec::new());

/// The window's handle, once it exists (0 before); a swap request posts to it.
static WINDOW: AtomicIsize = AtomicIsize::new(0);

thread_local! {
    // The window's thread only: the view, which an update swaps the app in.
    static VIEW: RefCell<Option<Rc<AppView>>> = const { RefCell::new(None) };
}

/// Writes the app's logs to the debugger (`OutputDebugString`): a windowed program has no console. The JS `console`
/// (target `js`), uncaught JS errors, warnings, errors and the update's messages.
struct DebugLogger;

impl log::Log for DebugLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.level() <= log::Level::Warn || metadata.target() == "js"
    }

    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) {
            debug_output(&format!("{} {}: {}\n", record.level(), record.target(), record.args()));
        }
    }

    fn flush(&self) {}
}

static LOGGER: DebugLogger = DebugLogger;

fn main() -> ExitCode {
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Info);
    nsh_platform_windows::set_ui_sets(vec![nsh_base::registry(), set_discoveryos()]);

    // The package directory: `nsh` next to the executable (or `NSH_APP_DIR`, as `nsh run` sets it).
    let dir = match std::env::var_os("NSH_APP_DIR") {
        Some(dir) => PathBuf::from(dir),
        None => std::env::current_exe()
            .and_then(|exe| exe.canonicalize())
            .ok()
            .and_then(|exe| exe.parent().map(|d| d.join("nsh")))
            .unwrap_or_default(),
    };

    // The swap is requested from the JS thread; the window's thread does the work when it gets the message.
    let _ = update::ACTIVATE.set(Box::new(|bytes: Vec<u8>| {
        if let Ok(mut pending) = PENDING.lock() {
            pending.push(bytes);
        }
        let window = WINDOW.load(Ordering::Acquire);
        if window != 0 {
            // SAFETY: posting to a window handle is thread-safe; a window that is gone just drops the message.
            unsafe {
                let _ = PostMessageW(Some(HWND(window as *mut _)), WM_NSH_SWAP, WPARAM(0), LPARAM(0));
            }
        }
    }));

    // The window's thread gets the stack size `run_app` gives its own: deep view trees recurse in drawing.
    let ui = std::thread::Builder::new()
        .name("nsh-ui".into())
        .stack_size(8 << 20)
        .spawn(move || run_window(&dir));
    match ui.map(std::thread::JoinHandle::join) {
        Ok(Ok(code)) => code,
        Ok(Err(_)) => ExitCode::FAILURE,
        Err(err) => {
            fatal_error(&format!("Cannot start the UI thread: {err}"));
            ExitCode::FAILURE
        }
    }
}

/// Opens the app's window, runs it until the window closes.
fn run_window(dir: &Path) -> ExitCode {
    // SAFETY: process setup before any window exists: per-monitor DPI (points stay sharp on every monitor) and an
    // OLE apartment for the clipboard, drag and drop and WIC.
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let _ = OleInitialize(None);
    }
    let options = app_options(dir);
    // The package kept from an earlier update when it still verifies, else the bundle shipped in the app.
    let bundle = match update::startup_package() {
        Some((bundle, build)) => {
            update::ACTIVE_BUILD.store(build, Ordering::SeqCst);
            bundle
        }
        // SAFETY: the bytecode is a resource of this app's own package.
        None => match unsafe { Bundle::read_trusted(&dir.join("bundle.nshc")) } {
            Ok(bundle) => bundle,
            Err(err) => {
                fatal_error(&format!("Cannot read the app bundle in {}: {err}", dir.display()));
                return ExitCode::FAILURE;
            }
        },
    };
    // SAFETY: a valid string; sets the app id the taskbar groups windows by.
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(options.app_id.as_str()));
    }

    let view = match AppView::new(None, options) {
        Ok(view) => view,
        Err(err) => {
            fatal_error(&format!("Cannot open a window: {err}"));
            return ExitCode::FAILURE;
        }
    };
    view.load(App::Js(bundle));
    let hwnd = view.hwnd();
    // SAFETY: subclasses the view's own window on this thread; the subclass proc is `swap_proc` below.
    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(swap_proc), 1, 0);
    }
    WINDOW.store(hwnd.0 as isize, Ordering::Release);
    VIEW.with(|slot| *slot.borrow_mut() = Some(view.clone()));
    view.show();

    let code = message_loop();

    WINDOW.store(0, Ordering::Release);
    view.stop();
    VIEW.with(|slot| slot.borrow_mut().take());
    drop(view);
    // SAFETY: pairs the `OleInitialize` above; nothing on this thread uses OLE afterwards.
    unsafe { OleUninitialize() };
    if code == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

/// The standard message loop, until the last top-level window closes (WM_QUIT).
fn message_loop() -> i32 {
    let mut msg = MSG::default();
    // SAFETY: the standard message loop.
    unsafe {
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    msg.wParam.0 as i32
}

/// The window's subclass: handles a swap request, passes every other message on.
unsafe extern "system" fn swap_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if msg == WM_NSH_SWAP {
        let pending = match PENDING.lock() {
            Ok(mut pending) => std::mem::take(&mut *pending),
            Err(_) => Vec::new(),
        };
        for bytes in pending {
            swap(bytes);
        }
        return LRESULT(0);
    }
    // SAFETY: default handling, on the window's own thread.
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

/// Runs on the window's thread: verifies the package again, builds its bundle, and swaps the view.
fn swap(bytes: Vec<u8>) {
    match update::bundle_from_package(&bytes) {
        Ok((bundle, build)) => VIEW.with(|slot| {
            if let Some(view) = slot.borrow().as_ref() {
                update::ACTIVE_BUILD.store(build, Ordering::SeqCst);
                view.load(App::Js(bundle));
            }
        }),
        Err(err) => log::warn!("update refused: {err}"),
    }
}

/// The window's options from the package: its assets, name, id and appearance (`app.json`).
fn app_options(dir: &Path) -> AppOptions {
    let mut options = AppOptions {
        asset_base: Some(AssetBase::Directory(dir.join("assets"))),
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

#[allow(non_snake_case)]
fn set_discoveryos() -> nsh_core::element::Registry {
    use nsh_app_discoveryos::*;
    __nsh_native_module()
}
