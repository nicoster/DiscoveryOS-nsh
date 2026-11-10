//! The Keychain, for the saved login (`CurrentUserStore.swift`: a generic
//! password under the service `com.nickr.discoveryOS`). NSH's `Storage` is the
//! app's own data and has no secrets store, so this goes through Rust.
//!
//! macOS uses the login Keychain; Windows uses the Credential Manager (a
//! per-user generic credential). The JS API is the same on both.

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

#[cfg(target_os = "windows")]
mod imp {
    use super::service;
    use std::ptr;
    use windows_sys::Win32::Foundation::{ERROR_NOT_FOUND, GetLastError};
    use windows_sys::Win32::Security::Credentials::{
        CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredDeleteW, CredFree, CredReadW, CredWriteW,
    };

    /// Credential Manager caps a generic credential's blob at 2560 bytes.
    const MAX_BLOB: usize = 2560;

    /// The target name: `service:account`, UTF-16 and NUL-terminated.
    fn target(account: &str) -> Vec<u16> {
        format!("{}:{}", service(), account).encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn last_error(what: &str) -> String {
        // SAFETY: GetLastError has no preconditions.
        format!("{what} failed (Win32 error {})", unsafe { GetLastError() })
    }

    pub fn save(account: &str, secret: &str) -> Result<(), String> {
        let blob = secret.as_bytes();
        if blob.len() > MAX_BLOB {
            return Err(format!("secret is {} bytes; Credential Manager holds at most {MAX_BLOB}", blob.len()));
        }
        let mut name = target(account);
        let cred = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: name.as_mut_ptr(),
            Comment: ptr::null_mut(),
            LastWritten: windows_sys::Win32::Foundation::FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 },
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_ptr() as *mut u8,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: ptr::null_mut(),
            TargetAlias: ptr::null_mut(),
            UserName: ptr::null_mut(),
        };
        // SAFETY: `cred` and the buffers it points to (`name`, `blob`) outlive the call.
        if unsafe { CredWriteW(&cred, 0) } == 0 {
            return Err(last_error("CredWriteW"));
        }
        Ok(())
    }

    pub fn load(account: &str) -> Result<Option<String>, String> {
        let name = target(account);
        let mut out: *mut CREDENTIALW = ptr::null_mut();
        // SAFETY: on success CredReadW allocates `out`, which is freed below.
        if unsafe { CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut out) } == 0 {
            // SAFETY: GetLastError has no preconditions.
            if unsafe { GetLastError() } == ERROR_NOT_FOUND {
                return Ok(None);
            }
            return Err(last_error("CredReadW"));
        }
        // SAFETY: `out` is valid until CredFree; the blob is copied before freeing.
        let bytes = unsafe {
            let c = &*out;
            std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec()
        };
        // SAFETY: `out` came from CredReadW and is freed exactly once.
        unsafe { CredFree(out as *const _) };
        String::from_utf8(bytes).map(Some).map_err(|e| e.to_string())
    }

    pub fn delete(account: &str) -> Result<(), String> {
        let name = target(account);
        // SAFETY: `name` is a valid NUL-terminated UTF-16 string for the call.
        if unsafe { CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
            // SAFETY: GetLastError has no preconditions.
            if unsafe { GetLastError() } == ERROR_NOT_FOUND {
                return Ok(());
            }
            return Err(last_error("CredDeleteW"));
        }
        Ok(())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
    const MSG: &str = "the Keychain is not available on this platform";

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
