import { expect, test } from "nsh/test";
import { floorLinkUrl, postLinkFromUrl, postLinksIn } from "./postLinks";

const HOST = "https://www.4d4y.com/forum/";
const findpost = (pid: string, tid: string) => `${HOST}redirect.php?goto=findpost&pid=${pid}&ptid=${tid}`;

test("the copied address is the forum's own findpost link, and reads back as the same floor", () => {
  expect(floorLinkUrl("65983916", "3111528")).toBe(findpost("65983916", "3111528"));
  expect(postLinkFromUrl(floorLinkUrl("65983916", "3111528"))).toEqual({
    pid: "65983916",
    ptid: "3111528",
    url: findpost("65983916", "3111528"),
  });
});

test("a thread link that opens at a floor names that floor", () => {
  expect(postLinkFromUrl(`${HOST}viewthread.php?tid=3111528&page=3#pid65983916`)).toEqual({
    pid: "65983916",
    ptid: "3111528",
    url: `${HOST}viewthread.php?tid=3111528&page=3#pid65983916`,
  });
  expect(postLinkFromUrl(`${HOST}viewthread.php?tid=3111528&pid=42`)?.pid).toBe("42");
  expect(postLinkFromUrl(`${HOST}forum.php?mod=viewthread&tid=3111528&pid=42`)).toEqual({
    pid: "42",
    ptid: "3111528",
    url: `${HOST}forum.php?mod=viewthread&tid=3111528&pid=42`,
  });
});

test("a relative address with HTML-escaped ampersands is read against the forum", () => {
  expect(postLinkFromUrl("redirect.php?goto=findpost&amp;pid=1&amp;ptid=2")).toEqual({
    pid: "1",
    ptid: "2",
    url: findpost("1", "2"),
  });
});

test("a link with no floor, another site, or another scheme is not a post link", () => {
  expect(postLinkFromUrl(`${HOST}viewthread.php?tid=3111528`)).toBe(undefined);
  expect(postLinkFromUrl(`${HOST}viewthread.php?tid=3111528&pid=abc`)).toBe(undefined);
  expect(postLinkFromUrl("https://example.com/redirect.php?goto=findpost&pid=1&ptid=2")).toBe(undefined);
  expect(postLinkFromUrl("mailto:a@b.com")).toBe(undefined);
  expect(postLinkFromUrl("https://www.4d4y.com/forum/attachment.php?aid=1")).toBe(undefined);
});

test("post links keep their order, and a floor linked twice gives one card", () => {
  const html =
    `<a href="${findpost("1", "9")}">看这里</a> 然后 ` +
    `${findpost("2", "9")} 以及 <a href="${HOST}viewthread.php?tid=9&pid=1">同一楼</a>`;
  expect(postLinksIn(html)).toEqual([
    { pid: "1", ptid: "9", url: findpost("1", "9") },
    { pid: "2", ptid: "9", url: findpost("2", "9") },
  ]);
});

test("trailing punctuation after a bare address is not part of the link", () => {
  expect(postLinksIn(`见 ${findpost("7", "9")}。`)).toEqual([
    { pid: "7", ptid: "9", url: findpost("7", "9") },
  ]);
});

test("a quote's arrow does not get a preview, but a link in the post's own text does", () => {
  const quote =
    `<div class="quote"><blockquote><font size="2">甲 发表于 t ` +
    `<a href="${findpost("1", "9")}">↩</a></font>引用</blockquote></div>`;
  expect(postLinksIn(quote + `<a href="${findpost("2", "9")}">这个帖子</a>`)).toEqual([
    { pid: "2", ptid: "9", url: findpost("2", "9") },
  ]);
});

test("a post with no post links gives no cards", () => {
  expect(postLinksIn(`普通文本，<a href="${HOST}viewthread.php?tid=9">整个帖子</a>，和 https://example.com/x`)).toEqual([]);
});
