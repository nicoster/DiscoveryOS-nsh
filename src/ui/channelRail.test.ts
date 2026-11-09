// The channel column shows as a rail when folded by the user or when the window is narrow.
import { expect, test } from "nsh/test";
import { channelsRailed, RAIL_BELOW } from "./channelRail";

test("a wide window with the column open shows the full column", () => {
  expect(channelsRailed(1200, false)).toBe(false);
});

test("a folded column is a rail at any width", () => {
  expect(channelsRailed(1200, true)).toBe(true);
});

test("a window narrower than the breakpoint is a rail even when not folded", () => {
  expect(channelsRailed(RAIL_BELOW - 1, false)).toBe(true);
  expect(channelsRailed(RAIL_BELOW, false)).toBe(false);
});
