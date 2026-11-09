// The size in pixels of a picture, read from its file header: PNG, GIF and JPEG. Other
// formats (WebP, HEIC, ...) give null, and the caller shows them at a fixed size.
export type PixelSize = { width: number; height: number };

export function pixelSize(bytes: Uint8Array): PixelSize | null {
  return pngSize(bytes) ?? gifSize(bytes) ?? jpegSize(bytes);
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

function pngSize(b: Uint8Array): PixelSize | null {
  // The signature, then the IHDR chunk whose data starts with the width and height.
  const signature = [0x89, 0x50, 0x4e, 0x47];
  if (b.length < 24 || !signature.every((v, i) => b[i] === v)) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function gifSize(b: Uint8Array): PixelSize | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
}

function jpegSize(b: Uint8Array): PixelSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Start-of-frame markers carry the size; C4, C8 and CC are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}
