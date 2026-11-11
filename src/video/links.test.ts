import { expect, test } from "nsh/test";
import { isVideoLink, MAX_VIDEO_LINKS_PER_POST, videoLinksIn } from "./links";

test("finds video pages on known sites", () => {
  expect(isVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  expect(isVideoLink("https://m.youtube.com/shorts/abc123")).toBe(true);
  expect(isVideoLink("https://vimeo.com/76979871")).toBe(true);
  expect(isVideoLink("https://v.youku.com/v_show/id_XNDU2MjQ2MjQ0.html")).toBe(true);
  expect(isVideoLink("https://v.qq.com/x/page/abc123.html")).toBe(true);
  expect(isVideoLink("https://www.iqiyi.com/v_19rr7abcd.html")).toBe(true);
  expect(isVideoLink("https://www.ixigua.com/7000000000000000000")).toBe(true);
  expect(isVideoLink("https://www.kuaishou.com/short-video/3xabc")).toBe(true);
  expect(isVideoLink("https://video.weibo.com/show?fid=1034:abc")).toBe(true);
  expect(isVideoLink("https://weibo.com/tv/show/1034:abc")).toBe(true);
  expect(isVideoLink("https://www.tiktok.com/@someone/video/7000000000000000000")).toBe(true);
  expect(isVideoLink("https://x.com/someone/status/1234567890")).toBe(true);
  expect(isVideoLink("https://twitter.com/someone/status/1234567890")).toBe(true);
});

test("finds video files by their extension, query or not", () => {
  expect(isVideoLink("https://example.com/clip.mp4")).toBe(true);
  expect(isVideoLink("https://example.com/clip.MP4?token=1")).toBe(true);
  expect(isVideoLink("https://example.com/live/index.m3u8")).toBe(true);
  expect(isVideoLink("https://example.com/clip.webm")).toBe(true);
});

test("ignores other links, including the sites' non-video pages", () => {
  expect(isVideoLink("https://www.youtube.com/@channel")).toBe(false);
  expect(isVideoLink("https://vimeo.com/")).toBe(false);
  expect(isVideoLink("https://x.com/someone")).toBe(false);
  expect(isVideoLink("https://example.com/photo.jpg")).toBe(false);
  expect(isVideoLink("https://example.com/page")).toBe(false);
  expect(isVideoLink("ftp://example.com/clip.mp4")).toBe(false);
  expect(isVideoLink("not a url")).toBe(false);
});

test("leaves the Bilibili and Douyin links to their own modules", () => {
  expect(videoLinksIn('<a href="https://www.bilibili.com/video/BV1GJ411x7h7">b</a>')).toEqual([]);
  expect(videoLinksIn('<a href="https://www.douyin.com/video/7158738411396943111">d</a>')).toEqual([]);
});

test("finds the links in a post's HTML in order, without repeats, and unescapes &amp;", () => {
  const html =
    '<a href="https://example.com/a.mp4?x=1&amp;y=2">a</a> <a href="https://example.com/b.mp4">b</a> ' +
    'again https://example.com/a.mp4?x=1&y=2 and <img src="https://example.com/cover.jpg">';
  expect(videoLinksIn(html)).toEqual(["https://example.com/a.mp4?x=1&y=2", "https://example.com/b.mp4"]);
});

test("shows at most a few video links per post", () => {
  const html = [1, 2, 3, 4, 5].map((i) => `https://example.com/${i}.mp4`).join(" ");
  expect(videoLinksIn(html)).toHaveLength(MAX_VIDEO_LINKS_PER_POST);
});
