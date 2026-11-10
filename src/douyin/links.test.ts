import { expect, test } from "nsh/test";
import { douyinPageUrl, douyinVideoIds, MAX_DOUYIN_PER_POST } from "./links";

test("finds the video ids a post links to, in order, without repeats", () => {
  const html = '<a href="https://www.douyin.com/jingxuan?modal_id=7704664139281869563">a</a> and <a href="https://www.douyin.com/video/7158738411396943111">b</a> again 7704664139281869563';
  expect(douyinVideoIds(html)).toEqual(["7704664139281869563", "7158738411396943111"]);
});

test("ignores links that are not Douyin video pages", () => {
  expect(douyinVideoIds('<a href="https://www.douyin.com/user/abc">u</a>')).toEqual([]);
  expect(douyinVideoIds('<a href="https://example.com/video/7158738411396943111">no</a>')).toEqual([]);
});

test("shows at most a few players per post", () => {
  const html = ["7000000001", "7000000002", "7000000003"].map((id) => `www.douyin.com/video/${id}`).join(" ");
  expect(douyinVideoIds(html).length).toEqual(MAX_DOUYIN_PER_POST);
});

test("every form becomes the jingxuan page", () => {
  expect(douyinPageUrl("7704664139281869563")).toEqual("https://www.douyin.com/jingxuan?modal_id=7704664139281869563");
});
