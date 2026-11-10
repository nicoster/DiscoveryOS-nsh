//! Hot update of the app's TSX: verifies a signed `.nshpkg` (see `docs/hot-update.md`) and swaps the
//! running app for it. The app's Rust, the native modules and the root key stay as built.

use nsh_core::prelude::*;

/// The trusted root's public key (`trust/root.pub`).
const ROOT_PUB: &str = include_str!("../trust/root.pub");

/// The embedded app's `nsh.json`: its capabilities are the grant ceiling for every package.
const EMBEDDED_NSH_JSON: &str = include_str!("../nsh.json");

/// Installed by the runner (`runner/main.rs`): swaps the running app for the package in `bytes`, on the
/// main thread, which AppKit requires.
pub static ACTIVATE: std::sync::OnceLock<Box<dyn Fn(Vec<u8>) + Send + Sync>> =
    std::sync::OnceLock::new();

/// Updates from TSX: `Updater.verify(path)` and `Updater.activate(path)`. Both answer "ok <build>"
/// or "err <reason>".
#[module]
pub struct Updater;

#[module]
impl Updater {
    /// Verifies the package at `path` against the trusted root.
    pub fn verify(path: String) -> String {
        match std::fs::read(&path) {
            Err(err) => format!("err read {path}: {err}"),
            Ok(bytes) => match verify_bytes(&bytes) {
                Ok(build) => format!("ok {build}"),
                Err(err) => format!("err {err}"),
            },
        }
    }

    /// Verifies the package at `path`, then swaps the running app for it.
    pub fn activate(path: String) -> String {
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(err) => return format!("err read {path}: {err}"),
        };
        match verify_bytes(&bytes) {
            Err(err) => format!("err {err}"),
            Ok(build) => match ACTIVATE.get() {
                None => "err no runner handler".into(),
                Some(handler) => {
                    handler(bytes);
                    format!("ok {build}")
                }
            },
        }
    }
}

/// Verifies `bytes` (signature, certificate, hashes, build, runtime) and returns its build.
pub fn verify_bytes(bytes: &[u8]) -> Result<u64, String> {
    let trust = trust_store()?;
    let assets = std::env::temp_dir().join("discoveryos-update-assets");
    let loaded = nsh_engine::verify_package(&trust, bytes, &assets)?;
    Ok(loaded.app.build)
}

/// The bundle of a verified package. Its capabilities are capped at the embedded `nsh.json`'s, so a
/// package cannot grant itself more network access than this build declares.
pub fn bundle_from_package(bytes: &[u8]) -> Result<nsh_engine::Bundle, String> {
    let trust = trust_store()?;
    let package = trust
        .verify(bytes, nsh_engine::BYTECODE_VERSION)
        .map_err(|e| e.to_string())?;
    let mut bundle = nsh_engine::Bundle::from_package(&package)?;
    let manifest: serde_json::Value =
        serde_json::from_str(EMBEDDED_NSH_JSON).map_err(|e| e.to_string())?;
    if !manifest["capabilities"].is_null() {
        bundle.policy.granted = Some(nsh_engine::parse_capabilities(
            &manifest["capabilities"].to_string(),
        )?);
    }
    Ok(bundle)
}

fn trust_store() -> Result<nsh_engine::package::TrustStore, String> {
    let root = nsh_engine::package::PublicKey::from_base64(ROOT_PUB.trim())
        .map_err(|e| format!("root key: {e}"))?;
    let mut trust = nsh_engine::package::TrustStore::new();
    trust.add_root(root);
    Ok(trust)
}
