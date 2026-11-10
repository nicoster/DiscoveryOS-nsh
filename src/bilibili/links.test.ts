import { expect, test } from "nsh/test";
import { bilibiliVideoIds, MAX_VIDEOS_PER_POST } from "./links";

test("finds the BV ids a post links to, in order, without repeats", () => {
  const html = '<a href="https://www.bilibili.com/video/BV1GJ411x7h7/">x</a> and <a href="http://bilibili.com/video/BV1xx411c7mD?p=2">y</a> again BV1GJ411x7h7';
  expect(bilibiliVideoIds(html)).toEqual(["BV1GJ411x7h7", "BV1xx411c7mD"]);
});

test("ignores links that are not Bilibili video pages", () => {
  expect(bilibiliVideoIds('<a href="https://www.bilibili.com/read/cv123">read</a>')).toEqual([]);
  expect(bilibiliVideoIds('<a href="https://example.com/BV1GJ411x7h7">no</a>')).toEqual([]);
});

test("shows at most a few players per post", () => {
  const ids = Array.from({ length: MAX_VIDEOS_PER_POST + 2 }, (_, i) => `bilibili.com/video/BV1aaaaaa${String(i).padStart(3, "0")}`).join(" ");
  expect(bilibiliVideoIds(ids).length).toEqual(MAX_VIDEOS_PER_POST);
});
