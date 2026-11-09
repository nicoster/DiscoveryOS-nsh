import { expect, test } from "nsh/test";
import { pixelSize } from "./pixelSize";

// A PNG: the signature, then an IHDR chunk with the width and height (big-endian).
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

test("reads a PNG's width and height, not square", () => {
  expect(pixelSize(png(800, 300))).toEqual({ width: 800, height: 300 });
  expect(pixelSize(png(120, 900))).toEqual({ width: 120, height: 900 });
});

test("reads a GIF's little-endian size", () => {
  const b = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0x10, 0x00]);
  expect(pixelSize(b)).toEqual({ width: 320, height: 16 });
});

test("reads a JPEG's start-of-frame size, after its other segments", () => {
  // SOI, an APP0 segment of 4 bytes of payload, then SOF0 with height 480 and width 640.
  const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x06, 0, 0, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80]);
  expect(pixelSize(b)).toEqual({ width: 640, height: 480 });
});

test("an unknown format has no size", () => {
  expect(pixelSize(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe(null);
  expect(pixelSize(new Uint8Array([]))).toBe(null);
});
