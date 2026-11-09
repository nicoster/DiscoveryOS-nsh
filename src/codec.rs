//! GB18030 codec for Discuz pages (`4d4y.com` serves GB18030 and expects GB18030
//! form bodies). TSX's `TextDecoder` and `TextEncoder` only know UTF-8, UTF-16
//! and windows-1252, so the app goes through here.

use encoding_rs::GB18030;
use nsh_core::prelude::*;

/// GB18030 bytes to text and back.
#[module]
pub struct Gb18030;

#[module]
impl Gb18030 {
    /// Decodes GB18030 bytes. Malformed sequences become U+FFFD.
    pub fn decode(bytes: Vec<u8>) -> String {
        let (text, _, _) = GB18030.decode(&bytes);
        text.into_owned()
    }

    /// Encodes text as GB18030. GB18030 maps all of Unicode, so nothing is lost.
    pub fn encode(text: String) -> Vec<u8> {
        let (bytes, _, _) = GB18030.encode(&text);
        bytes.into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_gb18030_bytes() {
        // "中" is D6 D0 in GBK and GB18030.
        assert_eq!(Gb18030::decode(vec![0xD6, 0xD0]), "中");
    }

    #[test]
    fn round_trips_chinese_text() {
        let s = "论坛 Discuz 回帖".to_owned();
        assert_eq!(Gb18030::decode(Gb18030::encode(s.clone())), s);
    }

    #[test]
    fn covers_characters_outside_the_bmp() {
        // U+1F600 is a four-byte GB18030 sequence, not a numeric reference.
        let s = "a😀".to_owned();
        let bytes = Gb18030::encode(s.clone());
        assert_eq!(bytes.len(), 1 + 4);
        assert_eq!(Gb18030::decode(bytes), s);
    }
}
