//! The Keychain, for the saved login (`CurrentUserStore.swift`: a generic
//! password under the service `com.nickr.discoveryOS`). NSH's `Storage` is the
//! app's own data and has no secrets store, so this goes through Rust.

use nsh_core::prelude::*;

/// The Keychain service the app's passwords sit under.
const SERVICE: &str = "com.nickr.discoveryOS";
/// A separate service for the headless test runner (`nsh test`, a binary whose
/// name ends in `-test`). Its items are not the user's, and reading the user's
/// items from it makes macOS ask for the login password.
const TEST_SERVICE: &str = "com.nickr.discoveryOS.test";

/// The service this process uses: the test runner gets its own.
fn service() -> &'static str {
    let is_test = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().ends_with("-test")))
        .unwrap_or(false);
    if is_test { TEST_SERVICE } else { SERVICE }
}

/// `errSecItemNotFound`.
#[cfg(target_os = "macos")]
const NOT_FOUND: i32 = -25300;

#[cfg(target_os = "macos")]
mod imp {
    use super::{NOT_FOUND, service};
    use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

    pub fn save(account: &str, secret: &str) -> Result<(), String> {
        set_generic_password(service(), account, secret.as_bytes()).map_err(|e| e.to_string())
    }

    pub fn load(account: &str) -> Result<Option<String>, String> {
        match get_generic_password(service(), account) {
            Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|e| e.to_string()),
            Err(e) if e.code() == NOT_FOUND => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn delete(account: &str) -> Result<(), String> {
        match delete_generic_password(service(), account) {
            Ok(()) => Ok(()),
            Err(e) if e.code() == NOT_FOUND => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    const MSG: &str = "the Keychain is only available on macOS";

    pub fn save(_: &str, _: &str) -> Result<(), String> {
        Err(MSG.to_owned())
    }

    pub fn load(_: &str) -> Result<Option<String>, String> {
        Err(MSG.to_owned())
    }

    pub fn delete(_: &str) -> Result<(), String> {
        Err(MSG.to_owned())
    }
}

/// Saved secrets, one per account.
#[module]
pub struct Keychain;

#[module]
impl Keychain {
    /// Stores `secret` for `account`, replacing any saved one.
    pub fn save(account: String, secret: String) -> Result<(), String> {
        imp::save(&account, &secret)
    }

    /// The secret saved for `account`, or `null`.
    pub fn load(account: String) -> Result<Option<String>, String> {
        imp::load(&account)
    }

    /// Removes the secret saved for `account`, if any.
    pub fn delete(account: String) -> Result<(), String> {
        imp::delete(&account)
    }
}
