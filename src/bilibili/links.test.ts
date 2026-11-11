import { expect, test } from "nsh/test";
import { bilibiliRefs, bilibiliVideoIn, MAX_VIDEOS_PER_POST } from "./links";

test("finds the BV ids a post links to, in order, without repeats", () => {
  const html = '<a href="https://www.bilibili.com/video/BV1GJ411x7h7/">x</a> and <a href="http://bilibili.com/video/BV1xx411c7mD?p=2">y</a> again BV1GJ411x7h7';
  expect(bilibiliRefs(html)).toEqual([{ bvid: "BV1GJ411x7h7" }, { bvid: "BV1xx411c7mD" }]);
});

test("reads mobile pages, av numbers, and the player embed", () => {
  expect(bilibiliRefs('<a href="https://m.bilibili.com/video/BV1GJ411x7h7">m</a>')).toEqual([{ bvid: "BV1GJ411x7h7" }]);
  expect(bilibiliRefs('<a href="https://www.bilibili.com/video/av170001">a</a>')).toEqual([{ aid: "170001" }]);
  expect(bilibiliRefs('<iframe src="https://player.bilibili.com/player.html?aid=170001&page=1"></iframe>')).toEqual([{ aid: "170001" }]);
  expect(bilibiliRefs('<iframe src="https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&page=1"></iframe>')).toEqual([{ bvid: "BV1GJ411x7h7" }]);
});

test("keeps a short link as a URL to resolve", () => {
  expect(bilibiliRefs("看这个 b23.tv/abcDEF1 好")).toEqual([{ url: "https://b23.tv/abcDEF1" }]);
  expect(bilibiliRefs('<a href="https://bili2233.cn/xyz123">s</a>')).toEqual([{ url: "https://bili2233.cn/xyz123" }]);
});

test("a single resolved URL gives its video id", () => {
  expect(bilibiliVideoIn("https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=x")).toEqual({ bvid: "BV1GJ411x7h7" });
  expect(bilibiliVideoIn("https://www.bilibili.com/video/av170001")).toEqual({ aid: "170001" });
  expect(bilibiliVideoIn("https://www.bilibili.com/read/cv123")).toEqual(undefined);
});

test("ignores links that are not Bilibili video pages", () => {
  expect(bilibiliRefs('<a href="https://www.bilibili.com/read/cv123">read</a>')).toEqual([]);
  expect(bilibiliRefs('<a href="https://example.com/BV1GJ411x7h7">no</a>')).toEqual([]);
});

test("shows at most a few players per post", () => {
  const ids = Array.from({ length: MAX_VIDEOS_PER_POST + 2 }, (_, i) => `bilibili.com/video/BV1aaaaaa${String(i).padStart(3, "0")}`).join(" ");
  expect(bilibiliRefs(ids).length).toEqual(MAX_VIDEOS_PER_POST);
});
