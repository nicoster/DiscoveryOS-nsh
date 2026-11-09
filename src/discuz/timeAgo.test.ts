// The forum's Beijing-time stamps read as relative phrases, whatever the zone.
import { expect, test } from "nsh/test";
import { timeAgo } from "./timeAgo";

// 2026-11-08 19:00 Beijing time is 11:00 UTC.
const NOW = Date.UTC(2026, 10, 8, 11, 0);

test("a stamp minutes old reads as minutes ago", () => {
  expect(timeAgo("2026-11-8 18:57", NOW)).toBe("3 minutes ago");
});

test("hours and days use plural and singular", () => {
  expect(timeAgo("2026-11-8 14:00", NOW)).toBe("5 hours ago");
  expect(timeAgo("2026-11-7 19:00", NOW)).toBe("1 day ago");
});

test("text that does not parse is shown as it is", () => {
  expect(timeAgo("昨天 12:00", NOW)).toBe("昨天 12:00");
});
