//! Hot update of the app's TSX: verifies a signed `.nshpkg` (see `docs/hot-update.md`) and swaps the
//! running app for it. The app's Rust, the native modules and the root key stay as built.
//!
//! State lives in `<data dir>/updates/`:
//! - `trust/`: the trust store (accepted builds, revocation list), kept by nsh;
//! - `pending.nshpkg`: a package swapped in but not yet seen healthy;
//! - `current.nshpkg`: the last package seen healthy, loaded again at startup.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use nsh_core::prelude::*;
use nsh_engine::package::{Revocations, TrustStore, VerifiedPackage};
use sha2::{Digest, Sha256};

/// The trusted root's public key (`trust/root.pub`).
const ROOT_PUB: &str = include_str!("../trust/root.pub");

/// The embedded app's `nsh.json`: its capabilities are the grant ceiling for every package, and its
/// `build` is the build of the bundle shipped in the app.
const EMBEDDED_NSH_JSON: &str = include_str!("../nsh.json");

const PENDING: &str = "pending.nshpkg";
const CURRENT: &str = "current.nshpkg";

/// The build of the package the app runs after a swap or at startup (0: the embedded bundle).
pub static ACTIVE_BUILD: AtomicU64 = AtomicU64::new(0);

/// Installed by the runner (`runner/main.rs`): swaps the running app for the package in `bytes`, on the
/// main thread, which AppKit requires.
pub static ACTIVATE: std::sync::OnceLock<Box<dyn Fn(Vec<u8>) + Send + Sync>> =
    std::sync::OnceLock::new();

/// Updates from TSX. Results are "ok <value>" or "err <reason>".
#[module]
pub struct Updater;

#[module]
impl Updater {
    /// The build the app runs: the embedded bundle's, or the build of the package swapped in.
    pub fn current_build() -> u32 {
        current_build().min(u32::MAX as u64) as u32
    }

    /// A path for a downloaded package named `name` (ASCII letters, digits, `-`, `_`), in the app's
    /// updates directory. Empty when the name or the directory is unusable.
    pub fn staging_path(name: String) -> String {
        let valid = !name.is_empty()
            && name.len() <= 64
            && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !valid {
            return String::new();
        }
        let Ok(dir) = state_dir() else {
            return String::new();
        };
        if std::fs::create_dir_all(&dir).is_err() {
            return String::new();
        }
        dir.join(format!("{name}.nshpkg")).to_string_lossy().into_owned()
    }

    /// Verifies the package at `path` against the trusted root and the revocations in force.
    pub fn verify(path: String) -> String {
        match std::fs::read(&path) {
            Err(err) => format!("err read {path}: {err}"),
            Ok(bytes) => match trust_store().and_then(|trust| open_package_full(&trust, &bytes)) {
                Ok(verified) => format!("ok {}", verified.app.build),
                Err(err) => format!("err {err}"),
            },
        }
    }

    /// Checks the package at `path` against `sha256` (lowercase hex), requires a newer build than the one
    /// running, keeps it as pending, and swaps the running app for it. The swap is accepted once
    /// `markHealthy` runs in the new app.
    pub fn activate(path: String, sha256: String) -> String {
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(err) => return format!("err read {path}: {err}"),
        };
        if !sha256_hex(&bytes).eq_ignore_ascii_case(&sha256) {
            return "err sha256 does not match the manifest".into();
        }
        let build = match trust_store().and_then(|trust| open_package_full(&trust, &bytes)) {
            Ok(verified) => verified.app.build,
            Err(err) => return format!("err {err}"),
        };
        if build <= current_build() {
            return format!("err build {build} is not newer than {}", current_build());
        }
        if let Err(err) = write_state_file(PENDING, &bytes) {
            return format!("err {err}");
        }
        match ACTIVATE.get() {
            None => "err no runner handler".into(),
            Some(handler) => {
                handler(bytes);
                format!("ok {build}")
            }
        }
    }

    /// Called by a running app once it is healthy: accepts the pending package (older builds are refused
    /// from now on, also after a restart) and keeps it to load at startup. "ok none" when nothing is pending.
    pub fn mark_healthy() -> String {
        let path = match state_dir() {
            Ok(dir) => dir.join(PENDING),
            Err(err) => return format!("err {err}"),
        };
        let Ok(bytes) = std::fs::read(&path) else {
            return "ok none".into();
        };
        let result = trust_store().and_then(|mut trust| {
            let verified = open_package_full(&trust, &bytes)?;
            trust.accept_receipt(&verified.receipt()).map_err(|e| e.to_string())?;
            Ok(verified.app.build)
        });
        match result {
            Err(err) => {
                let _ = std::fs::remove_file(&path);
                format!("err {err}")
            }
            Ok(build) => match write_state_file(CURRENT, &bytes) {
                Err(err) => format!("err {err}"),
                Ok(()) => {
                    let _ = std::fs::remove_file(&path);
                    format!("ok {build}")
                }
            },
        }
    }

    /// Applies a revocation list (JSON, signed by the trusted root). Drops the kept package if it is now
    /// refused. "ok <sequence>", or "ok stale" when the list is not newer than the one applied.
    pub fn apply_revocations(text: String) -> String {
        let result = trust_store().and_then(|mut trust| {
            let list = Revocations::from_json(&text).map_err(|e| e.to_string())?;
            let sequence = match trust.update_revocations(list) {
                Ok(sequence) => format!("ok {sequence}"),
                Err(nsh_engine::package::Error::StaleRevocations { .. }) => "ok stale".to_string(),
                Err(err) => return Err(err.to_string()),
            };
            drop_refused_current(&trust);
            Ok(sequence)
        });
        match result {
            Ok(text) => text,
            Err(err) => format!("err {err}"),
        }
    }
}

/// The build of the running app: the embedded one or the package swapped in, whichever is newer.
pub fn current_build() -> u64 {
    embedded_build().max(ACTIVE_BUILD.load(Ordering::SeqCst))
}

/// The build of the bundle shipped in the app (`nsh.json` `build`).
pub fn embedded_build() -> u64 {
    serde_json::from_str::<serde_json::Value>(EMBEDDED_NSH_JSON)
        .ok()
        .and_then(|manifest| manifest["build"].as_u64())
        .unwrap_or(0)
}

/// At startup: the kept package, when it verifies and is newer than the embedded bundle. Any package that
/// is refused is removed, so it is not tried again.
pub fn startup_package() -> Option<(nsh_engine::Bundle, u64)> {
    let path = state_dir().ok()?.join(CURRENT);
    let bytes = std::fs::read(&path).ok()?;
    let trust = trust_store().ok()?;
    match open_package_full(&trust, &bytes) {
        Ok(verified) if verified.app.build > embedded_build() => {
            let build = verified.app.build;
            let bundle = bundle_of(&verified).ok()?;
            Some((bundle, build))
        }
        Ok(_) => None,
        Err(err) => {
            eprintln!("update: kept package refused: {err}");
            let _ = std::fs::remove_file(&path);
            None
        }
    }
}

/// The bundle and build of a verified package. Its capabilities are capped at the embedded `nsh.json`'s,
/// so a package cannot grant itself more network access than this build declares.
pub fn bundle_from_package(bytes: &[u8]) -> Result<(nsh_engine::Bundle, u64), String> {
    let trust = trust_store()?;
    let verified = open_package_full(&trust, bytes)?;
    let build = verified.app.build;
    Ok((bundle_of(&verified)?, build))
}

/// Verifies `bytes` (signature, certificate, revocations, hashes, rollback, runtime). The result carries
/// its receipt, for accepting it later.
fn open_package_full(trust: &TrustStore, bytes: &[u8]) -> Result<VerifiedPackage, String> {
    trust
        .verify(bytes, nsh_engine::BYTECODE_VERSION)
        .map_err(|e| e.to_string())
}

fn bundle_of(verified: &VerifiedPackage) -> Result<nsh_engine::Bundle, String> {
    let mut bundle = nsh_engine::Bundle::from_package(verified)?;
    let manifest: serde_json::Value =
        serde_json::from_str(EMBEDDED_NSH_JSON).map_err(|e| e.to_string())?;
    if !manifest["capabilities"].is_null() {
        bundle.policy.granted = Some(nsh_engine::parse_capabilities(
            &manifest["capabilities"].to_string(),
        )?);
    }
    Ok(bundle)
}

/// Removes the kept package when the trust store now refuses it (for example after a revocation).
fn drop_refused_current(trust: &TrustStore) {
    let Ok(dir) = state_dir() else { return };
    let path = dir.join(CURRENT);
    if let Ok(bytes) = std::fs::read(&path) {
        if open_package_full(trust, &bytes).is_err() {
            let _ = std::fs::remove_file(&path);
        }
    }
}

fn trust_store() -> Result<TrustStore, String> {
    let root = nsh_engine::package::PublicKey::from_base64(ROOT_PUB.trim())
        .map_err(|e| format!("root key: {e}"))?;
    let mut trust = TrustStore::open(state_dir()?.join("trust")).map_err(|e| e.to_string())?;
    trust.add_root(root);
    Ok(trust)
}

/// The updates directory: `<data dir>/updates`, created on demand.
fn state_dir() -> Result<PathBuf, String> {
    let dir = nsh_engine::data_dir()
        .ok_or_else(|| "no data directory".to_string())?
        .join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Writes `bytes` to `name` in the updates directory, whole, then renamed into place.
fn write_state_file(name: &str, bytes: &[u8]) -> Result<(), String> {
    let dir = state_dir()?;
    let tmp = dir.join(format!("{name}.tmp"));
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(name)).map_err(|e| e.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}
