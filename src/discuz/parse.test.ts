import { expect, test } from "nsh/test";
import { htmlToText, parsePmConversation, parsePmUsers, absolutize, floorFromLink, captureGroups, htmlDecode, parseBookmarks, parseChannels, parseMyReplies, parseMyThreads, unescapeNumericEntities, parsePosts, parseProfile, parseReplies, parseSearchResults, parseUser, mergePage, fixImages, removePercentEncoding, trimLeadingBlanks, threadIdFromLink, parseThreadPageInfo } from "./parse";

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

test("marks the old threads above a newer one as pinned", () => {
  // Sorted by last reply, newest first, except the pinned ones at the top, which are older.
  const thread = (tid: string, lastReply: string) =>
    `<tbody id="normalthread_${tid}"><tr><td class="folder"></td><td class="icon">&nbsp;</td>` +
    `<th class="subject"><span id="thread_${tid}"><a href="viewthread.php?tid=${tid}&amp;extra=page%3D1">T${tid}</a></span></th>` +
    '<td class="author"><cite><a href="space.php?uid=7">someone</a></cite><em>2022-6-13</em></td>' +
    '<td class="nums"><strong>0</strong>/<em>108894</em></td>' +
    `<td class="lastpost">\n<cite><a href="space.php?username=bob">Bob</a></cite><em><a href="redirect.php?tid=${tid}&amp;goto=lastpost#lastpost">${lastReply}</a></em></td>` +
    "</tr></tbody>";
  const html =
    thread("1", "2022-6-13 22:57") + thread("2", "2022-1-20 11:35") + thread("3", "2026-11-10 12:06") + thread("4", "2026-11-09 08:00");
  const posts = parsePosts(html);
  expect(posts.map((p) => [p.id, p.pinned === true])).toEqual([
    ["1", true],
    ["2", true],
    ["3", false],
    ["4", false],
  ]);
});

test("marks no thread pinned when the replies are in order", () => {
  const thread = (tid: string, lastReply: string) =>
    `<tr><td><span id="thread_${tid}"><a href="viewthread.php?tid=${tid}">T${tid}</a></span></td>` +
    '<td class="author"><cite><a href="space.php?uid=7">someone</a></cite><em>2022-6-13</em></td>' +
    '<td class="nums"><strong>0</strong>/<em>1</em></td>' +
    `<td class="lastpost">\n<cite><a href="space.php?username=bob">Bob</a></cite><em><a href="redirect.php?tid=${tid}&amp;goto=lastpost#lastpost">${lastReply}</a></em></td></tr>`;
  const posts = parsePosts(thread("1", "2026-11-10 12:06") + thread("2", "2026-11-09 08:00"));
  expect(posts.every((p) => !p.pinned)).toBe(true);
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

test("parses the my-threads page", () => {
  const row =
    '<tr><td><a href="viewthread.php?tid=3175769"><img src="icon.gif"></a></td>' +
    '<td><a href="viewthread.php?tid=3175769" class="s">Short &amp; kept</a></td>' +
    '<td><a href="forumdisplay.php?fid=2">Discovery</a></td><td>正常</td>' +
    '<td><a href="space.php?username=%BF%CD%B9%DB%BC%C6%BB%AE">客观计划</a></td>' +
    '<td><a href="redirect.php?tid=3175769&amp;goto=lastpost#lastpost">2023-5-18 18:41</a></td></tr>';
  expect(parseMyThreads(`<table>${row}</table>`)).toEqual([
    { id: "3175769", title: "Short & kept", fid: "2", lastReplyBy: "客观计划", lastReplyAt: "2023-5-18 18:41" },
  ]);
});

test("parses the my-replies page: the reply text is in the row after the title", () => {
  const first =
    '<tr><td class="folder"><a href="redirect.php?goto=findpost&amp;pid=74912495&amp;ptid=3457415" target="_blank"></a></td>' +
    '<td class="icon">&nbsp;</td>' +
    '<th><a href="redirect.php?goto=findpost&amp;pid=74912495&amp;ptid=3457415" target="_blank">Test &amp; more</a></th>' +
    '<td class="forum"><a href="forumdisplay.php?fid=50">DC,NB</a></td><td class="nums">正常</td>' +
    '<td class="lastpost"><em>2026-11-8 21:53</em></td></tr>';
  const reply = '<tr><td class="folder">&nbsp;</td><td class="icon">&nbsp;</td><th colspan="4" class="lighttxt">test 3 &amp;#128077; ...</th></tr>';
  const bare =
    '<tr><td class="folder"><a href="redirect.php?goto=findpost&amp;pid=1&amp;ptid=2"></a></td><td class="icon">&nbsp;</td>' +
    '<th><a href="redirect.php?goto=findpost&amp;pid=1&amp;ptid=2">No reply text</a></th>' +
    '<td class="forum"><a href="forumdisplay.php?fid=2">Discovery</a></td><td class="nums">正常</td>' +
    '<td class="lastpost"><em>2026-10-5 21:14</em></td></tr>';
  expect(parseMyReplies(`<table>${first}${reply}${bare}</table>`)).toEqual([
    { id: "3457415", title: "Test & more", fid: "50", at: "2026-11-8 21:53", excerpt: "test 3 👍 ..." },
    { id: "2", title: "No reply text", fid: "2", at: "2026-10-5 21:14", excerpt: "" },
  ]);
});

test("unescapes numeric references the page escaped twice, and only those", () => {
  expect(unescapeNumericEntities("a &amp;#129309; b &amp;amp; c &amp;#x1F44D;")).toBe("a &#129309; b &amp;amp; c &#x1F44D;");
});

test("reads a user's uid and avatar", () => {
  const html = '<div>(UID: 88)</div><div class="avatar"><img src="avatar/88.jpg"></div>';
  expect(parseUser(html, "Dan")).toEqual({ id: "88", name: "Dan", avatar: "avatar/88.jpg" });
});

test("reads a profile page's fields for the account menu", () => {
  const html =
    '<h1>nicoster</h1><li>(UID: 205208)</li><div class="avatar"><img src="avatar/205208.jpg"></div>' +
    '<h3 class="blocktitle lightlink">用户组: <a href="faq.php">初级会员</a> <img src="x.gif" /> </h3>' +
    '<ul><li>注册日期: 2005-8-4</li><li>上次访问: 2026-11-10 09:33</li><li>最后发表: 2026-11-10 08:41</li>' +
    '<li>注册 IP: 219.144.180.15 - </li><li>上次访问 IP: 10.100.96.151 - </li></ul>' +
    '<ul><li>发帖数级别: 太健谈了 <img src="star.gif" /></li><li>阅读权限: 10</li>' +
    '<li>帖子: 1116 篇(占全部帖子的 %)</li><li>平均每日发帖: 0.14 篇</li><li>精华: 0 篇</li>' +
    '<li>页面访问量: 416227</li></ul>' +
    '<p>在线时间: 总计在线 <em>3943.33</em> 小时, 本月在线 <em>9.33</em> 小时 </p>' +
    '<h3 class="blocktitle lightlink">积分: 0</h3><p>威望: 0 ,&nbsp;金钱: 0 </p>';
  expect(parseProfile(html, "nicoster")).toEqual({
    avatar: "avatar/205208.jpg",
    group: "初级会员",
    registered: "2005-8-4",
    lastVisit: "2026-11-10 09:33",
    lastPost: "2026-11-10 08:41",
    postLevel: "太健谈了",
    readPermission: "10",
    posts: "1116",
    dailyPosts: "0.14",
    essence: "0",
    pageViews: "416227",
    onlineTotal: "3943.33",
    onlineThisMonth: "9.33",
    credits: "0",
    prestige: "0",
    money: "0",
  });
});

test("leaves out a profile field the page does not show", () => {
  expect(parseProfile("<p>nothing here</p>", "Dan")).toEqual({});
});

test("reads the floor a findpost link opens", () => {
  expect(floorFromLink("https://www.4d4y.com/forum/redirect.php?goto=findpost&pid=65983916&ptid=3111528")).toEqual({
    pid: "65983916",
    ptid: "3111528",
  });
  expect(floorFromLink("https://www.4d4y.com/forum/viewthread.php?tid=3111528")).toBe(undefined);
  expect(floorFromLink("https://example.com/redirect.php?goto=findpost&pid=1&ptid=2")).toBe(undefined);
});

test("stops paging at an empty page or a repeated first item", () => {
  const first = [{ id: "1" }, { id: "2" }];
  expect(mergePage(first, [{ id: "3" }])).toEqual({ items: [{ id: "1" }, { id: "2" }, { id: "3" }], more: true });
  expect(mergePage(first, [{ id: "1" }, { id: "2" }])).toEqual({ items: first, more: false });
  expect(mergePage(first, [])).toEqual({ items: first, more: false });
});

test("keeps paging when a page repeats a sticky thread and adds new ones", () => {
  const first = [{ id: "1" }, { id: "2" }];
  expect(mergePage(first, [{ id: "1" }, { id: "3" }])).toEqual({ items: [{ id: "1" }, { id: "2" }, { id: "3" }], more: true });
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

test("parses the threads of a title search, without the keyword's highlight tags", () => {
  // Rows as search.php sends them: the highlighted keyword is an <em>, the forum is named.
  const html = `<table><thead><tr class="colplural"><td class="nums">回复/查看</td></tr></thead><tbody>
<tr>
<td class="folder"><a href="viewthread.php?tid=3473784&amp;highlight=" target="_blank"><img src="x.gif" /></a></td>
<th class="subject"><label>&nbsp;</label>
<a href="viewthread.php?tid=3473784&amp;highlight=" target="_blank" >《2026胡润百富榜》发布，<em style="color:red;">张一鸣</em>以6700亿元刷新中国首富财富纪录</a>
<span class="threadpages">... <a href="viewthread.php?tid=3473784&page=1" target="_blank">1</a> </span></th>
<td class="forum"><a href="forumdisplay.php?fid=2">Discovery</a></td>
<td class="author"><cite><a href="space.php?uid=38997">%E8%8B%A5%E6%B0%B8</a></cite><em>2026-10-27</em></td>
<td class="nums"><strong>15</strong> / <em>988</em></td>
<td class="lastpost"><cite><a href="space.php?username=%D4%AD%CE%B6">原味</a></cite><em><a href="redirect.php?tid=3473784&amp;goto=lastpost#lastpost">2026-10-28 02:59</a></em></td>
</tr></tbody>
<tbody>
<tr>
<th class="subject"><a href="viewthread.php?tid=3452476&amp;highlight=" target="_blank" >当年这个牛人，<em style="color:red;">张一鸣</em>了吧...</a></th>
<td class="forum"><a href="forumdisplay.php?fid=65">时事</a></td>
<td class="author"><cite><a href="space.php?uid=750802">aiki3066</a></cite><em>2026-6-12</em></td>
<td class="nums"><strong>5</strong> / <em>655</em></td>
<td class="lastpost"><cite><a href="space.php?username=lyk175551">lyk175551</a></cite><em><a href="redirect.php?tid=3452476&amp;goto=lastpost#lastpost">2026-6-12 11:09</a></em></td>
</tr></tbody></table>`;
  expect(parseSearchResults(html)).toEqual([
    {
      id: "3473784",
      title: "《2026胡润百富榜》发布，张一鸣以6700亿元刷新中国首富财富纪录",
      fid: "2",
      uid: "38997",
      author: "若永",
      at: "2026-10-27",
      replies: 15,
      views: 988,
      lastReplyBy: "原味",
      lastReplyAt: "2026-10-28 02:59",
    },
    {
      id: "3452476",
      title: "当年这个牛人，张一鸣了吧...",
      fid: "65",
      uid: "750802",
      author: "aiki3066",
      at: "2026-6-12",
      replies: 5,
      views: 655,
      lastReplyBy: "lyk175551",
      lastReplyAt: "2026-6-12 11:09",
    },
  ]);
  expect(parseSearchResults("<table><tr><td>没有找到匹配的结果</td></tr></table>")).toEqual([]);
});

test("parses the private-message list: one row per correspondent", () => {
  const html = `
<form method="post" id="pmform" action="pm.php?action=del&amp;filter=privatepm&amp;page=1">
<ul class="pm_list"><li id="pm_10137545" class="s_clear ">
<a href="space.php?uid=612354" target="_blank" class="avatar"><img src="https://img02.4d4y.com/forum/uc_server/data/avatar/000/61/23/54_avatar_small.jpg" /></a>
<p class="cite">
<cite><a href="space.php?uid=612354" target="_blank">eistein</a></cite>2026-6-24 20:03</p>
<div class="summary">
</div>
<p class="more"><a href="pm.php?uid=612354&amp;filter=privatepm&amp;daterange=5#new" class="to">查看消息</a></p>
<span class="action">
<input name="uid[]" class="checkbox" type="checkbox" value="612354" />
</span>
</li><li id="pm_9801850" class="s_clear colplural">
<a href="space.php?uid=549058" target="_blank" class="avatar"><img src="https://img02.4d4y.com/forum/uc_server/data/avatar/000/54/90/58_avatar_small.jpg" /></a>
<p class="cite">
<cite><a href="space.php?uid=549058" target="_blank">llwzw</a></cite>2023-8-28 21:44</p>
<div class="summary">
</div>
<p class="more"><a href="pm.php?uid=549058&amp;filter=privatepm&amp;daterange=5#new" class="to">查看消息</a></p>
</li></ul>`;
  expect(parsePmUsers(html)).toEqual([
    { id: "612354", title: "eistein", author: "eistein", at: "2026-6-24 20:03", excerpt: "" },
    { id: "549058", title: "llwzw", author: "llwzw", at: "2023-8-28 21:44", excerpt: "" },
  ]);
});

test("parses a private-message conversation: sender, time, text and avatar, oldest first", () => {
  const html = `
<ul class="pm_list">
<li class="pm_date"><strong>2025-1-6</strong></li><li id="pm_10137547" class="s_clear ">
<a href="space.php?uid=612354" class="avatar"><img src="https://img02.4d4y.com/forum/uc_server/data/avatar/000/61/23/54_avatar_small.jpg" onerror="this.onerror=null;this.src='x.gif'" /></a>
<p class="cite">
<cite>eistein</cite>
2025-1-6 20:39</p>
<div class="summary">兄弟你好，请问升降桌好用么？</div>
<span class="action">
<a href="pm.php?action=new&amp;pmid=10137547" onclick="showWindow('sendpm', this.href);return false;">转发</a>
</span>
</li>
<li class="pm_date"><strong>2026-6-24</strong></li><li id="pm_10376547" class="s_clear self">
<a class="avatar"><img src="https://img02.4d4y.com/forum/uc_server/data/avatar/000/20/52/08_avatar_small.jpg" onerror="this.onerror=null;this.src='x.gif'" /></a>
<p class="cite">
<cite>nicoster</cite>
2026-6-24 17:26</p>
<div class="summary">才看到消息. <br />
<br />
我买过两种.</div>
<span class="action">
<a href="pm.php?action=new&amp;pmid=10376547" onclick="showWindow('sendpm', this.href);return false;">转发</a>
</span>
</li>
</ul>`;
  expect(parsePmConversation(html)).toEqual([
    {
      author: "eistein",
      at: "2025-1-6 20:39",
      body: "兄弟你好，请问升降桌好用么？",
      avatar: "https://img02.4d4y.com/forum/uc_server/data/avatar/000/61/23/54_avatar_small.jpg",
    },
    {
      author: "nicoster",
      at: "2026-6-24 17:26",
      body: "才看到消息. <br />\n<br />\n我买过两种.",
      avatar: "https://img02.4d4y.com/forum/uc_server/data/avatar/000/20/52/08_avatar_small.jpg",
    },
  ]);
});

test("a private message's numeric references are unescaped as a reply's are", () => {
  const html = `<ul class="pm_list"><li id="pm_1"><a href="space.php?uid=5"><img src="a.jpg" /></a>
<p class="cite"><cite><a href="space.php?uid=5">nicoster</a></cite>2019-1-12 17:38</p>
<div class="summary">&amp;#128077; 非常感谢!</div></li></ul>`;
  expect(parsePmConversation(html)[0].body).toBe("&#128077; 非常感谢!");
});

test("reads the thread a 4d4y link opens, and nothing else", () => {
  expect(threadIdFromLink("https://www.4d4y.com/forum/viewthread.php?tid=3464174")).toBe("3464174");
  expect(threadIdFromLink("https://4d4y.com/forum/forum.php?mod=viewthread&tid=12")).toBe("12");
  expect(threadIdFromLink("https://www.4d4y.com/forum/forum.php?mod=forumdisplay&fid=3")).toBe(undefined);
  expect(threadIdFromLink("https://www.4d4y.com/forum/viewthread.php?tid=abc")).toBe(undefined);
  expect(threadIdFromLink("https://evil.example.com/forum/viewthread.php?tid=1")).toBe(undefined);
  expect(threadIdFromLink("https://4d4y.com.evil.example/viewthread.php?tid=1")).toBe(undefined);
  expect(threadIdFromLink("javascript:viewthread.php?tid=1")).toBe(undefined);
});

test("reads a thread page's title and forum", () => {
  expect(parseThreadPageInfo('<span id="thread_subject">A &amp; <b>B</b></span><a href="forumdisplay.php?fid=7">x</a>')).toEqual({ title: "A & B", fid: "7" });
  expect(parseThreadPageInfo("<title>标题 - 4D4Y</title>")).toEqual({ title: "标题", fid: undefined });
  // The page title is "subject - channel - site": the channel named by the fid link goes too.
  expect(
    parseThreadPageInfo('<title>家里的工具更加齐全了 - Discovery - 4D4Y</title><a href="forumdisplay.php?fid=2">Discovery</a>'),
  ).toEqual({ title: "家里的工具更加齐全了", fid: "2" });
});

test("quoting keeps the words and drops the markup's line breaks and indentation", () => {
  const html = "<div>\n    我的文集 2\n  </div>\n<br><br>\n  <div>其实就是一个测试.</div>\n";
  expect(htmlToText(html)).toBe("我的文集 2\n\n其实就是一个测试.");
});

test("a run of blank lines in a quote is one blank line", () => {
  expect(htmlToText("一<br><br><br><br>二")).toBe("一\n\n二");
});
