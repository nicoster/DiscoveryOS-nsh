//! Debug log to a file, chosen by the `DISCO_DEBUG` environment variable.
//!
//! `DISCO_DEBUG=/path/to/disco.log` turns debugging on and appends to that file. Unset, empty, or a path
//! that cannot be opened for writing (a directory, or a missing parent folder) keeps it off. The native side
//! does the file work because `nsh.json` only grants writes under the app's data directory.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

use nsh_core::prelude::*;

/// The path set by `DISCO_DEBUG`, checked once. `None` when debugging is off.
static LOG_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

fn log_path() -> Option<&'static PathBuf> {
    LOG_PATH.get_or_init(resolve_path).as_ref()
}

/// The path from `DISCO_DEBUG`, when it names a file this process can append to.
fn resolve_path() -> Option<PathBuf> {
    let raw = std::env::var("DISCO_DEBUG").ok()?;
    let path = PathBuf::from(raw.trim());
    if raw.trim().is_empty() || path.is_dir() {
        return None;
    }
    // A bare file name is relative to the working directory, so only check a parent that is named.
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return None;
        }
    }
    OpenOptions::new().create(true).append(true).open(&path).ok()?;
    Some(path)
}

/// Debug logging to the file named by `DISCO_DEBUG`.
#[module]
pub struct DebugLog;

#[module]
impl DebugLog {
    /// The log file's path, or `null` when `DISCO_DEBUG` is unset or not a usable file path.
    pub fn path() -> Option<String> {
        log_path().map(|p| p.display().to_string())
    }

    /// Appends `line` and a newline to the log file. Returns `false` when debugging is off or the write fails.
    pub fn write(line: String) -> bool {
        let Some(path) = log_path() else {
            return false;
        };
        let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
            return false;
        };
        writeln!(file, "{line}").is_ok()
    }
}
