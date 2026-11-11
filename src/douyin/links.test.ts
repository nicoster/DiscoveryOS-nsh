import { expect, test } from "nsh/test";
import { douyinIdIn, douyinPageUrl, douyinRefs, MAX_DOUYIN_PER_POST } from "./links";

test("finds the video ids a post links to, in order, without repeats", () => {
  const html = '<a href="https://www.douyin.com/jingxuan?modal_id=7704664139281869563">a</a> and <a href="https://www.douyin.com/video/7158738411396943111">b</a> again 7704664139281869563';
  expect(douyinRefs(html)).toEqual([{ id: "7704664139281869563" }, { id: "7158738411396943111" }]);
});

test("reads every page form that carries a video id", () => {
  expect(douyinRefs('<a href="https://m.douyin.com/video/7158738411396943111">m</a>')).toEqual([{ id: "7158738411396943111" }]);
  expect(douyinRefs('<a href="https://www.douyin.com/discover?modal_id=7158738411396943111">d</a>')).toEqual([{ id: "7158738411396943111" }]);
  expect(douyinRefs('<a href="https://www.douyin.com/user/MS4wLjAB?modal_id=7158738411396943111">u</a>')).toEqual([{ id: "7158738411396943111" }]);
  expect(douyinRefs('<a href="https://www.iesdouyin.com/share/video/7706396751401372937/?region=CN">s</a>')).toEqual([{ id: "7706396751401372937" }]);
  expect(douyinRefs('<a href="https://m.douyin.com/share/video/7706396751401372937">s</a>')).toEqual([{ id: "7706396751401372937" }]);
});

test("keeps a v.douyin.com short link as a URL to resolve", () => {
  expect(douyinRefs("复制打开抖音 https://v.douyin.com/clTRic___fw/ 08/07")).toEqual([{ url: "https://v.douyin.com/clTRic___fw/" }]);
  expect(douyinRefs("v.douyin.com/clTRic___fw")).toEqual([{ url: "https://v.douyin.com/clTRic___fw/" }]);
});

test("a single resolved URL gives its video id", () => {
  expect(douyinIdIn("https://www.iesdouyin.com/share/video/7706396751401372937/?region=CN")).toEqual("7706396751401372937");
  expect(douyinIdIn("https://www.douyin.com/user/abc")).toEqual(undefined);
});

test("ignores links that are not Douyin video pages", () => {
  expect(douyinRefs('<a href="https://www.douyin.com/user/abc">u</a>')).toEqual([]);
  expect(douyinRefs('<a href="https://example.com/video/7158738411396943111">no</a>')).toEqual([]);
});

test("shows at most a few players per post", () => {
  const html = ["7000000001", "7000000002", "7000000003"].map((id) => `www.douyin.com/video/${id}`).join(" ");
  expect(douyinRefs(html).length).toEqual(MAX_DOUYIN_PER_POST);
});

test("every id becomes the jingxuan page", () => {
  expect(douyinPageUrl("7704664139281869563")).toEqual("https://www.douyin.com/jingxuan?modal_id=7704664139281869563");
});
