//! Local files for the reply box, named by `file:` URLs as the platform gives them. A file
//! copied in Finder comes as a file reference (`file:///.file/id=…`), which the system turns
//! into the file's path; a dropped file's URL is its path already. TSX cannot read either.

use nsh_core::prelude::*;

/// Local files named by `file:` URLs.
#[module]
pub struct Files;

#[module]
impl Files {
    /// The path of the file a `file:` URL names, `None` when the system cannot find it.
    pub fn path(uri: String) -> Option<String> {
        resolve(&uri)
    }

    /// The bytes of the file at `path`, `None` when it cannot be read.
    pub fn read(path: String) -> Option<Vec<u8>> {
        std::fs::read(path).ok()
    }
}

/// On macOS the system resolves file references (and percent-encoding) through NSURL.
#[cfg(target_os = "macos")]
fn resolve(uri: &str) -> Option<String> {
    use objc2_foundation::{NSString, NSURL};
    let url = NSURL::URLWithString(&NSString::from_str(uri))?;
    // A file reference resolves to its path; any other URL is its own path.
    let path = match url.filePathURL() {
        Some(file) => file.path(),
        None => url.path(),
    }?;
    Some(path.to_string())
}

#[cfg(not(target_os = "macos"))]
fn resolve(uri: &str) -> Option<String> {
    uri.strip_prefix("file://").map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_file_url_resolves_to_its_path() {
        let path = std::env::temp_dir().join("discoveryos-files-test.txt");
        std::fs::write(&path, b"hello").unwrap();
        let uri = format!("file://{}", path.display());
        assert_eq!(Files::path(uri).as_deref(), path.to_str());
        assert_eq!(Files::read(path.to_string_lossy().into_owned()), Some(b"hello".to_vec()));
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn a_missing_file_has_no_bytes() {
        assert_eq!(Files::read("/nonexistent/discoveryos/file".to_owned()), None);
    }
}
