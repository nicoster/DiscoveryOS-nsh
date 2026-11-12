import { expect, test } from "nsh/test";
import { NOTES_MAX, parseManifest, updateTitle } from "./updateManifest";

const SHA = "f4e3f6b7ea3640bab69753d6884cbbf8218b9efdf55ae5ada69821888a810b47";
const base = { id: "com.nickr.DiscoveryOS", build: 23, version: "1.0.4", url: "https://example.com/a.nshpkg", sha256: SHA };

test("a manifest without notes still parses, and has no notes", () => {
  const m = parseManifest(base);
  expect(m?.build).toBe(23);
  expect(m?.notes).toBeUndefined();
});

test("notes are kept, and cut to the limit", () => {
  expect(parseManifest({ ...base, notes: "fix search" })?.notes).toBe("fix search");
  expect(parseManifest({ ...base, notes: "x".repeat(NOTES_MAX + 50) })?.notes?.length).toBe(NOTES_MAX);
});

test("notes that are not a string make the manifest unusable", () => {
  expect(parseManifest({ ...base, notes: 42 })).toBeNull();
});

test("the tooltip names the version and build, then the notes", () => {
  expect(updateTitle({ ...base, build: 23, notes: undefined })).toBe("Update to 1.0.4 (build 23)");
  expect(updateTitle({ ...base, build: 23, notes: "fix search" })).toBe("Update to 1.0.4 (build 23)\nfix search");
});
