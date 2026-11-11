// The history's sections by browse time, read against a fixed "now" (a Wednesday, local time).
import { expect, test } from "nsh/test";
import { browseSection, groupHistory, type HistoryEntry } from "./historyGroups";
import type { Post } from "../discuz/parse";

// Wed 2026-11-11 15:00 local: this week starts Mon 11-09, last week Mon 11-02, this month Nov 1.
const now = new Date(2026, 10, 11, 15, 0);
const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h).getTime();

test("a view today, yesterday, earlier this week, last week, this and last month", () => {
  expect(browseSection(at(2026, 11, 11, 1), now)).toBe("Today");
  expect(browseSection(at(2026, 11, 10), now)).toBe("Yesterday");
  expect(browseSection(at(2026, 11, 9), now)).toBe("This week");
  expect(browseSection(at(2026, 11, 2), now)).toBe("Last week");
  expect(browseSection(at(2026, 11, 1), now)).toBe("This month");
  expect(browseSection(at(2026, 10, 31), now)).toBe("Last month");
});

test("an earlier month is named by its month and year", () => {
  expect(browseSection(at(2026, 9, 15), now)).toBe("September 2026");
  expect(browseSection(at(2025, 12, 31), now)).toBe("December 2025");
});

test("on a Monday, the Sunday before is yesterday, and this week holds only today", () => {
  const monday = new Date(2026, 10, 9, 9, 0);
  expect(browseSection(at(2026, 11, 8), monday)).toBe("Yesterday");
  expect(browseSection(at(2026, 11, 2), monday)).toBe("Last week");
});

test("the sections group newest first, one section per run of the same title", () => {
  const post = (id: string): Post => ({ id, title: id });
  const entries: HistoryEntry[] = [
    { post: post("old"), viewed: at(2026, 9, 1) },
    { post: post("a"), viewed: at(2026, 11, 11, 9) },
    { post: post("b"), viewed: at(2026, 11, 11, 8) },
    { post: post("c"), viewed: at(2026, 11, 10) },
  ];
  const sections = groupHistory(entries, now);
  expect(sections.map((s) => s.title)).toEqual(["Today", "Yesterday", "September 2026"]);
  expect(sections[0].posts.map((p) => p.id)).toEqual(["a", "b"]);
  expect(sections[2].posts.map((p) => p.id)).toEqual(["old"]);
});
