import { expect, test } from "nsh/test";
import { absolutize, buildQuote, captureGroups, htmlDecode, parseBookmarks, parseChannels, parsePosts, parseReplies, parseUser, mergePage, fixImages, removePercentEncoding, trimLeadingBlanks } from "./parse";

test("captureGroups returns one match's groups, or every whole match", () => {
  expect(captureGroups("a1b", "a(\\d)b", true)).toEqual(["1"]);
  expect(captureGroups("x1 x2", "x\\d")).toEqual(["x1", "x2"]);
  expect(captureGroups("none", "z(\\d)", true)).toEqual([]);
});

test("decodes titles' entities", () => {
  expect(htmlDecode("A &amp; B &#20013; &lt;x&gt;")).toBe("A & B 中 <x>");
});

test("unescapes percent-encoded names, and keeps bad escapes", () => {
  expect(removePercentEncoding("%E5%BC%A0")).toBe("张");
  expect(removePercentEncoding("%E5%")).toBe("%E5%");
});

test("parses channels from the index page", () => {
  const html = `<table><tr><td><a href="forumdisplay.php?fid=2">Discovery</a><p>desc here</p>今日: <strong>5</strong></td></tr></table>`;
  expect(parseChannels(html)).toEqual([{ id: "2", title: "Discovery", description: "desc here", newPosts: 5 }]);
});

test("parses threads from a forum page", () => {
  const row =
    '<tr><td><span class="x"><a href="viewthread.php?tid=99&amp;extra=1">Hello &amp; World</a></span>' +
    '<a href="space.php?uid=7">someone</a><em>2026-11-01</em>' +
    '<td class="nums"><strong>12</strong>/<em>340</em></td>' +
    'space.php?username=bob">Bob</a>lastpost">2026-11-02</a></tr>';
  expect(parsePosts(`<table>${row}</table>`)).toEqual([
    {
      id: "99",
      title: "Hello & World",
      uid: "7",
      author: "someone",
      at: "2026-11-01",
      replies: 12,
      views: 340,
      lastReplyBy: "Bob",
      lastReplyAt: "2026-11-02",
    },
  ]);
});

test("parses a channel row with no new posts", () => {
  const html = '<tr><td><a href="forumdisplay.php?fid=5">Plain</a><p>only text</p></td></tr>';
  expect(parseChannels(html)).toEqual([{ id: "5", title: "Plain", description: "only text", newPosts: 0 }]);
});

test("parses replies from a thread page", () => {
  const html =
    '<div>header</div><td class="postcontent postbottom">' +
    '<table id="pid555"><tr><td><a href="space.php?uid=7">Alice</a></td></tr>' +
    '<tr><td><a href="space.php?uid=7"><img src="avatar/7.jpg"></a></td>' +
    '<em>3</em><sup>#</sup><em id="authorposton1">发表于 2026-11-02 10:00</em>' +
    '<div class="postmessage">hello <b>world</b></div></tr></table>';
  expect(parseReplies(html)).toEqual([
    {
      id: "555",
      author: { id: "7", name: "Alice", avatar: "avatar/7.jpg" },
      at: "2026-11-02 10:00",
      seq: 3,
      body: '<div class="postmessage">hello <b>world</b></div></tr></table>',
    },
  ]);
});

test("makes relative links absolute and keeps the rest", () => {
  const base = "https://www.4d4y.com/forum/";
  expect(absolutize('<img src="images/a.gif"><a href="https://x.test/y">k</a><a href="#top">t</a>', base)).toBe(
    '<img src="https://www.4d4y.com/forum/images/a.gif"><a href="https://x.test/y">k</a><a href="#top">t</a>',
  );
});

test("parses the favorites page", () => {
  const row =
    '<tr><td><a href="viewthread.php?tid=42&amp;x=1">Saved &amp; kept</a></td>' +
    '<td><a href="forumdisplay.php?fid=2">Discovery</a></td>' +
    '<td class="nums">9</td><td><a href="space.php?username=x">Carol</a></td><td><a href="x">lastpost">2026-11-03</a></td></tr>';
  expect(parseBookmarks(`<table>${row}</table>`)).toEqual([
    { id: "42", title: "Saved & kept", fid: "2", replies: 9, lastReplyBy: "Carol", lastReplyAt: "2026-11-03" },
  ]);
});

test("reads a user's uid and avatar", () => {
  const html = '<div>(UID: 88)</div><div class="avatar"><img src="avatar/88.jpg"></div>';
  expect(parseUser(html, "Dan")).toEqual({ id: "88", name: "Dan", avatar: "avatar/88.jpg" });
});

test("quotes a reply as Discuz BBCode", () => {
  const reply = {
    id: "555",
    author: { id: "7", name: "Alice", avatar: "" },
    at: "2026-11-02 10:00",
    seq: 3,
    body: '<div class="postmessage">hi<br>there <b>you</b></div>',
  };
  const quote = buildQuote("https://h/", { id: "9", title: "t" }, reply);
  expect(quote.startsWith("[quote] hi\nthere you\n")).toBe(true);
  expect(quote).toContain("[url=https://h/redirect.php?goto=findpost&pid=555&ptid=9]");
});

test("stops paging at an empty page or a repeated first item", () => {
  const first = [{ id: "1" }, { id: "2" }];
  expect(mergePage(first, [{ id: "3" }])).toEqual({ items: [{ id: "1" }, { id: "2" }, { id: "3" }], more: true });
  expect(mergePage(first, [{ id: "1" }, { id: "2" }])).toEqual({ items: first, more: false });
  expect(mergePage(first, [])).toEqual({ items: first, more: false });
});

test("uses the real picture from file= when src is a placeholder", () => {
  expect(fixImages('<img src="images/loading.gif" file="attach/1.jpg" width="100">')).toBe(
    '<p><img src="attach/1.jpg" width="100%"></p>',
  );
  expect(fixImages('<img src="attach/full.jpg" file="attach/small.jpg">')).toBe('<p><img src="attach/full.jpg" width="100%"></p>');
  expect(fixImages('<img src="smilies/a.gif">')).toBe('<img src="smilies/a.gif">');
});

test("shows the original picture, not Discuz's thumbnail", () => {
  expect(fixImages('<img src="https://img02.4d4y.com/forum/attachments/d/a.jpg.thumb.jpg" border="0">')).toBe(
    '<p><img src="https://img02.4d4y.com/forum/attachments/d/a.jpg" border="0" width="100%"></p>',
  );
});

test("drops Discuz's size on pictures but keeps it on smilies", () => {
  expect(fixImages('<img src="attach/a.jpg" width="31" height="41" border="0">')).toBe(
    '<p><img src="attach/a.jpg" border="0" width="100%"></p>',
  );
  expect(fixImages('<img src="images/smilies/x.gif" width="20">')).toBe('<img src="images/smilies/x.gif" width="20">');
});

test("takes the full picture from a zoom link", () => {
  expect(
    fixImages(`<a href="javascript:;"><img onclick="zoom(this, 'attachments/d/a.jpg')" src="attachments/d/a.jpg.thumb.jpg" border="0"></a>`),
  ).toBe('<p><img src="attachments/d/a.jpg" border="0" width="100%"></p>');
});

test("drops hidden attachment spans, their menus and Discuz icons", () => {
  const html =
    'a<span style="position: absolute; display: none" id="attach_1"><img src="https://x/images/default/attachimg.gif" border="0"></span>' +
    '<a href="javascript:;"><img onclick="zoom(this, \'https://x/a.jpg\')" src="https://x/a.jpg.thumb.jpg"></a>' +
    '<div class="t_attach" id="m" style="position: absolute; display: none">\n<a href="x">下载</a>\n<div class="t_smallfont">2026</div>\n\n</div>\n<br />b';
  expect(fixImages(html)).toBe('a<p><img src="https://x/a.jpg" width="100%"></p>\n<br />b');
});

test("turns Discuz's layout table into blocks so pictures keep the column width", () => {
  expect(fixImages('<table><tr><td class="t_msgfont">a<img src="x.jpg"></td></tr></table>')).toBe(
    '<div><div><div>a<p><img src="x.jpg" width="100%"></p></div></div></div>',
  );
});

test("drops empty lines a post starts with", () => {
  expect(trimLeadingBlanks('<br /><p>&nbsp;</p><div class="x"> </div>正文<br>')).toBe("正文<br>");
  expect(trimLeadingBlanks("<b>标题</b>")).toBe("<b>标题</b>");
});
