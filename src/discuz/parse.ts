// Port of the regex helpers in `DiscuzAPI.swift`: `captureGroups` (its quirk:
// one match gives that match's groups, several give the whole matches),
// `htmlDecoded`, and the channel and thread rows of the forum pages.

/** `String.captureGroups(regex:skipFirst:)`. */
export function captureGroups(text: string, pattern: string, skipFirst = false): string[] {
  const re = new RegExp(pattern, "gs");
  const matches = [...text.matchAll(re)];
  if (matches.length > 1) return matches.map((m) => m[0]);
  const match = matches[0];
  if (!match) return [];
  return Array.from(match).slice(skipFirst ? 1 : 0).map((g) => g ?? "");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decodes the HTML entities a Discuz title can carry. */
export function htmlDecode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/** `removingPercentEncoding`: the text, or itself when it is not valid escapes. */
export function removePercentEncoding(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export type Channel = { id: string; title: string; description: string; newPosts: number };
export type Post = {
  id: string;
  title: string;
  uid?: string;
  author?: string;
  at?: string;
  /** The reply count, when the page shows it (the user's own threads do not). */
  replies?: number;
  views?: number;
  lastReplyBy?: string;
  lastReplyAt?: string;
  /** The forum (channel) the thread is in, when the page names it. */
  fid?: string;
  /** The start of the user's own reply, as the page shows it (My Replies). */
  excerpt?: string;
};

/** The channels on the index page (`DiscuzAPI.loadChannels`). */
export function parseChannels(html: string): Channel[] {
  const channels: Channel[] = [];
  for (const row of captureGroups(html, "<tr>.*?</tr>")) {
    const col = captureGroups(row, 'forumdisplay\\.php\\?fid=(\\d+).*?>([^<]+)</a>.*?<p>((?:[^<]+)?)<', true);
    if (col.length === 0) continue;
    const field = captureGroups(row, "今日: <strong>(\\d+)", true);
    const newPosts = field.length === 1 ? Number(field[0]) || 0 : 0;
    channels.push({ id: col[0], title: col[1], description: col[2], newPosts });
  }
  return channels;
}

/** The threads on a forum page (`DiscuzAPI.loadPosts`). */
export function parsePosts(html: string): Post[] {
  const posts: Post[] = [];
  for (const row of captureGroups(html, "<tr>.*?</tr>")) {
    const col = captureGroups(
      row,
      '<span[^>]*><a href="viewthread\\.php\\?tid=(\\d+)[^>]*>([^<]+).*href="space\\.php\\?uid=(\\d+)">([^<]+)</a>.*<em>(\\d{4}-\\d{1,2}-\\d{1,2})</em>.*<td class="nums"><strong>(\\d+)</strong>/<em>(\\d+)</em></td>.*space\\.php\\?username=[^"]+">([^<]+)<.*lastpost">([^<]+)<',
      true,
    );
    if (col.length === 0) continue;
    posts.push({
      id: col[0],
      title: htmlDecode(col[1]),
      uid: col[2],
      author: removePercentEncoding(col[3]),
      at: col[4],
      replies: Number(col[5]) || 0,
      views: Number(col[6]) || 0,
      lastReplyBy: removePercentEncoding(col[7]),
      lastReplyAt: col[8],
    });
  }
  return posts;
}

/**
 * The threads a title search returns (`search.php`). Its rows differ from a
 * forum page's: the title link sits in `th.subject`, the forum is named, and
 * the keyword's highlight tags are stripped from the title.
 */
export function parseSearchResults(html: string): Post[] {
  const posts: Post[] = [];
  for (const row of captureGroups(html, "<tr>.*?</tr>")) {
    const id = /viewthread\.php\?tid=(\d+)/.exec(row)?.[1];
    const rawTitle = /<th class="subject">[\s\S]*?<a href="viewthread\.php\?tid=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(row)?.[1];
    if (!id || rawTitle === undefined) continue;
    const forum = /<td class="forum"><a href="forumdisplay\.php\?fid=(\d+)"/.exec(row)?.[1];
    const author = /<td class="author">[\s\S]*?<a href="space\.php\?uid=(\d+)">([^<]*)<\/a>[\s\S]*?<em>([^<]*)<\/em>/.exec(row);
    const nums = /<td class="nums"><strong>(\d+)<\/strong> \/ <em>(\d+)<\/em>/.exec(row);
    const last = /<td class="lastpost">[\s\S]*?<cite><a href="space\.php\?username=[^"]*">([^<]*)<\/a><\/cite>\s*<em><a[^>]*>([^<]*)<\/a><\/em>/.exec(row);
    posts.push({
      id,
      title: htmlDecode(rawTitle.replace(/<[^>]+>/g, "")).trim(),
      fid: forum,
      uid: author?.[1],
      author: author ? removePercentEncoding(author[2]) : undefined,
      at: author?.[3],
      replies: Number(nums?.[1]) || 0,
      views: Number(nums?.[2]) || 0,
      lastReplyBy: last ? removePercentEncoding(last[1]) : undefined,
      lastReplyAt: last?.[2],
    });
  }
  return posts;
}

export type Author = { id: string; name: string; avatar: string };
export type Reply = {
  id: string;
  author: Author;
  at: string;
  /** The floor number (`#` in the page). */
  seq: number;
  /** The post's HTML body, as the page has it (Discuz's own markup). */
  body: string;
};

/** The replies on a thread page (`DiscuzAPI.loadReplies`). Bodies stay HTML:
 * the `TextView` renders HTML, so no Markdown conversion is needed. */
export function parseReplies(html: string): Reply[] {
  const replies: Reply[] = [];
  for (const row of html.split('<td class="postcontent postbottom">')) {
    const col = captureGroups(
      row,
      '<table id="pid(\\d+)".*?space\\.php\\?uid=(\\d+).*?>([^<]+)</a>.*href="space\\.php\\?uid=.*?<img src="([^"]+)".*<em>(\\d+)</em><sup>#</sup>.*<em id=.*?>发表于 ([^<]+)</em>.*(<div class="postmessage.*)$',
      true,
    );
    if (col.length === 0) continue;
    replies.push({
      id: col[0],
      author: { id: col[1], name: col[2], avatar: col[3] },
      at: col[5],
      seq: Number(col[4]) || -1,
      body: unescapeNumericEntities(col[6]),
    });
  }
  return replies;
}

/**
 * Undoes a second escaping of numeric character references (`&amp;#129309;` ->
 * `&#129309;`), which the reply pages use for emoji. Other text is left alone.
 */
export function unescapeNumericEntities(html: string): string {
  return html.replace(/&amp;(#x?[0-9a-fA-F]+;)/g, "&$1");
}

/** Makes relative `src` / `href` paths absolute against `base`, as the Swift
 * app's Markdown did with `baseURL`. Absolute, protocol-relative, `#` and
 * `javascript:` links are left alone. */
export function absolutize(html: string, base: string): string {
  return html.replace(/(src|href)="(?![a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|#)([^"]*)"/g, (_, attr: string, path: string) => {
    return `${attr}="${new URL(path, base).href}"`;
  });
}

/** The favorites page's threads (`DiscuzAPI.loadBookmarks`). */
export function parseBookmarks(html: string): Post[] {
  const posts: Post[] = [];
  for (const row of captureGroups(html, "<tr>.*?</tr>")) {
    const col = captureGroups(
      row,
      '<a href="viewthread\\.php\\?tid=(\\d+).*?>([^<]+)</a>.*?<a href="forumdisplay\\.php\\?fid=(\\d+).*?>([^<]+)</a>.*?<td class="nums">(\\d+)</td>.*?space\\.php\\?username[^>]+>([^<]+)</a>.*?lastpost">([^<]+)</a>',
      true,
    );
    if (col.length === 0) continue;
    posts.push({
      id: col[0],
      title: htmlDecode(col[1]),
      fid: col[2],
      replies: Number(col[4]) || 0,
      lastReplyBy: removePercentEncoding(col[5]),
      lastReplyAt: col[6],
    });
  }
  return posts;
}

/**
 * The threads the signed-in user started (`my.php?item=threads`). A row names the
 * thread, its forum, and its last poster and date; the page shows no reply count.
 */
export function parseMyThreads(html: string): Post[] {
  const posts: Post[] = [];
  for (const row of captureGroups(html, "<tr>.*?</tr>")) {
    const col = captureGroups(
      row,
      'viewthread\\.php\\?tid=(\\d+)[^"]*"[^>]*>([^<]+)</a>.*?forumdisplay\\.php\\?fid=(\\d+)"[^>]*>([^<]+)</a>.*?space\\.php\\?username=([^"]*)"[^>]*>([^<]+)</a>.*?goto=lastpost#lastpost"[^>]*>([^<]+)</a>',
      true,
    );
    if (col.length === 0) continue;
    posts.push({
      id: col[0],
      title: htmlDecode(col[1]).trim(),
      fid: col[2],
      lastReplyBy: removePercentEncoding(col[5]),
      lastReplyAt: col[6],
    });
  }
  return posts;
}

/**
 * The threads the signed-in user replied to (`my.php?item=posts`). Each reply is two
 * table rows: the first names the thread (its `redirect` link carries the thread id
 * `ptid`), its forum, and the reply time; the next row holds the start of the reply
 * in a `th.lighttxt` cell spanning the columns.
 */
export function parseMyReplies(html: string): Post[] {
  const posts: Post[] = [];
  let last: Post | undefined;
  for (const row of captureGroups(html, "<tr>.*?</tr>")) {
    const col = captureGroups(
      row,
      'redirect\\.php\\?goto=findpost(?:&amp;|&)pid=\\d+(?:&amp;|&)ptid=(\\d+)"[^>]*>([^<]+)</a>.*?forumdisplay\\.php\\?fid=(\\d+)"[^>]*>[^<]*</a>.*?(\\d{4}-\\d{1,2}-\\d{1,2} \\d{1,2}:\\d{2})',
      true,
    );
    if (col.length > 0) {
      last = { id: col[0], title: htmlDecode(col[1]).trim(), fid: col[2], at: col[3], excerpt: "" };
      posts.push(last);
      continue;
    }
    const text = /<th[^>]*class="lighttxt"[^>]*>([\s\S]*?)<\/th>/.exec(row)?.[1];
    // The list escapes the reply's entities twice (`&amp;#128077;`), so a second pass
    // turns them into the characters they stand for.
    if (last && text !== undefined) last.excerpt = htmlDecode(htmlDecode(text.replace(/<[^>]+>/g, ""))).trim();
  }
  return posts;
}

/** One private message in a conversation: its sender, when, its HTML body, and the sender's avatar. */
export type PmMessage = { author: string; at: string; body: string; avatar?: string };

const PM_TIME = /\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{2}/;

/**
 * The correspondents in the private messages (`pm.php?filter=privatepm`): one row per
 * person, with the time of the latest message. Shaped as thread rows, so the list shows
 * them the same way; the row's title is the person's name.
 */
export function parsePmUsers(html: string): Post[] {
  const posts: Post[] = [];
  for (const item of captureGroups(html, "<li[^>]*>.*?</li>")) {
    const uid = /pm\.php\?uid=(\d+)(?:&amp;|&)filter=privatepm/.exec(item)?.[1];
    // The name is the link in `cite`; the latest message's time follows it.
    const name = /<cite><a href="space\.php\?uid=\d+"[^>]*>([^<]+)<\/a><\/cite>/.exec(item)?.[1];
    const at = PM_TIME.exec(item)?.[0];
    if (!uid || !name || !at) continue;
    const decoded = htmlDecode(name).trim();
    posts.push({ id: uid, title: decoded, author: decoded, at, excerpt: "" });
  }
  return posts;
}

/**
 * The messages with one correspondent (`pm.php?uid=N`), in the order the page lists them.
 * Each message is an `li`: its sender in `cite`, the time after it, the text in
 * `div.summary`, and the sender's avatar image. Date headings are `li`s without a sender.
 */
export function parsePmConversation(html: string): PmMessage[] {
  const messages: PmMessage[] = [];
  for (const item of captureGroups(html, "<li[^>]*>.*?</li>")) {
    const author = /<cite>([\s\S]*?)<\/cite>/.exec(item)?.[1];
    const at = PM_TIME.exec(item)?.[0];
    const summary = /<div class="summary">([\s\S]*?)<\/div>/.exec(item)?.[1];
    if (!author || !at || summary === undefined) continue;
    const avatar = /<img src="([^"]+)"/.exec(item)?.[1];
    messages.push({
      author: htmlToText(author),
      at,
      // Line breaks in the source are layout whitespace; only `<br>` makes a new line.
      // The body stays HTML, as a thread reply's does, so both views decode it the same way.
      body: unescapeNumericEntities(summary),
      avatar: avatar ? htmlDecode(avatar) : undefined,
    });
  }
  return messages;
}

/** The user page's UID and avatar (`DiscuzAPI.loadUser`). */
export function parseUser(html: string, name: string): Author | undefined {
  const col = captureGroups(html, '\\(UID: (\\d+)\\).*<div class="avatar"><img src="([^"]+)', true);
  if (col.length === 0) return undefined;
  return { id: col[0], name, avatar: col[1] };
}

/** A page's HTML as plain text, for quoting (the Swift app quotes Markdown). */
export function htmlToText(html: string): string {
  return htmlDecode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
}

/** `DiscuzAPI.quoted`: a Discuz `[quote]` of a reply, linking back to it. */
export function buildQuote(
  host: string,
  thread: { id: string; title: string },
  reply: Reply,
): string {
  return (
    `[quote] ${htmlToText(reply.body)}\n` +
    `[size=2][color=#999999]${reply.author.name} 发表于 ${reply.at}[/color] ` +
    `[url=${host}redirect.php?goto=findpost&pid=${reply.id}&ptid=${thread.id}][img]${host}images/common/back.gif[/img][/url][/size][/quote]\n`
  );
}

/**
 * Appends a fetched page to the list. Paging ends when a page is empty, or when
 * its first item is already loaded: past its end, Discuz serves the last page
 * again. A short page is not an end, since the page size is the forum's own
 * setting and not always the same as the one asked for.
 */
export function mergePage<T extends { id: string }>(
  loaded: T[],
  incoming: T[],
): { items: T[]; more: boolean } {
  if (incoming.length === 0) return { items: loaded, more: false };
  // Discuz repeats its sticky threads at the top of every page, so a page can start with a
  // thread already listed and still hold new ones. The list ends only when nothing is new
  // (a page past the end repeats the last one it has).
  const seen = new Set(loaded.map((x) => x.id));
  const fresh = incoming.filter((x) => !seen.has(x.id));
  if (fresh.length === 0) return { items: loaded, more: false };
  return { items: [...loaded, ...fresh], more: true };
}

/** An absolute URL for a path on the forum (`DiscuzAPI`'s relative paths). */
export function absoluteUrl(path: string, base: string): string {
  return new URL(path, base).href;
}

/**
 * The thread a 4d4y link opens: `viewthread.php?tid=` or `forum.php?mod=viewthread&tid=`
 * on `4d4y.com` or one of its subdomains. Any other link gives `undefined`.
 */
export function threadIdFromLink(href: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.hostname !== "4d4y.com" && !url.hostname.endsWith(".4d4y.com")) return undefined;
  const isThread =
    /(^|\/)viewthread\.php$/.test(url.pathname) || (/(^|\/)forum\.php$/.test(url.pathname) && url.searchParams.get("mod") === "viewthread");
  const tid = url.searchParams.get("tid");
  if (!isThread || !tid || !/^\d+$/.test(tid)) return undefined;
  return tid;
}

/**
 * A thread page's title and forum (`fid`), as the page names them: the subject
 * heading, else the page `<title>` without its site suffix.
 */
export function parseThreadPageInfo(html: string): { title?: string; fid?: string } {
  const subject = /<span id="thread_subject">([\s\S]*?)<\/span>/.exec(html)?.[1];
  const pageTitle = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const fromTitle = pageTitle?.replace(/\s+-\s+[^-]*$/, "");
  const title = subject ? htmlDecode(subject.replace(/<[^>]*>/g, "")).trim() : fromTitle ? htmlDecode(fromTitle).trim() : undefined;
  const fid = /forumdisplay\.php\?fid=(\d+)/.exec(html)?.[1];
  return { title: title || undefined, fid };
}

/** Drops the empty lines a post starts with (`<br>`, or empty paragraphs and
 * blocks), which would otherwise show as a blank band under the author line. */
export function trimLeadingBlanks(html: string): string {
  let out = html;
  let previous: string;
  do {
    previous = out;
    out = out.replace(/^\s*(?:<br\s*\/?>|<(p|div|span)\b[^>]*>(?:\s|&nbsp;)*<\/\1>)/i, "");
  } while (out !== previous);
  return out;
}

/** The pictures of a Discuz post. Discuz wraps a picture as
 * `<a href="javascript:;"><img onclick="zoom(this, 'full.jpg')" src="thumb">`;
 * the full picture is in `zoom`, else `file=`, else `src=` (a placeholder such
 * as a loading image is skipped for `file=`). A picture is its own block that
 * fills the column; smilies keep their size. */
export function fixImages(html: string): string {
  // Discuz's hidden attachment spans and their menus are not content: the
  // TextView does not hide `display: none`, so they would show (as the small
  // attachment icons).
  // Discuz lays the body out in a table: a picture's percentage width would
  // then resolve against the cell's content, so the table becomes plain blocks.
  const flat = html.replace(/<(table|tr|td|th)\b[^>]*>/gi, "<div>").replace(/<\/(table|tr|td|th)>/gi, "</div>");
  const visible = flat
    .replace(/<span\b[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<div class="t_attach"[\s\S]*?<\/div>\s*<\/div>/gi, "");
  // A script-only link around a picture is just the picture.
  const unwrapped = visible.replace(/<a\b[^>]*href="javascript:[^"]*"[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, "$1");
  return unwrapped.replace(/<img\b([^>]*)>/gi, (whole, attrs: string) => {
    const src = /\bsrc="([^"]*)"/i.exec(attrs)?.[1];
    const file = /\bfile="([^"]+)"/i.exec(attrs)?.[1];
    const zoom = /zoom\(this,\s*'([^']+)'/i.exec(attrs)?.[1];
    const placeholder = !src || /loading|none\.gif|common\/|smilies\//i.test(src);
    const chosen = zoom ?? (placeholder && file ? file : src);
    if (!chosen) return whole;
    // Discuz's own icons (`images/default/...`) are not content.
    if (/images\/(default|attachicons|common)\//i.test(chosen)) return "";
    // Discuz's `x.jpg.thumb.jpg` is the small copy of `x.jpg`: show the original.
    const picture = chosen.replace(/\.thumb\.[a-z0-9]+$/i, "");
    const smiley = /smilies\//i.test(picture);
    let kept = attrs
      .replace(/\bsrc="[^"]*"/i, "")
      .replace(/\bfile="[^"]*"/i, "")
      .replace(/\bonclick="[^"]*"/i, "");
    if (smiley) {
      kept = kept.replace(/\s+/g, " ").trim();
      return `<img src="${picture}"${kept ? " " + kept : ""}>`;
    }
    kept = kept.replace(/\s(width|height)="[^"]*"/gi, "").replace(/\s+/g, " ").trim();
    return `<p><img src="${picture}"${kept ? " " + kept : ""} width="100%"></p>`;
  });
}

/** The forum's base URL, for relative paths (`DiscuzAPI.host`). */
export const HOST_BASE = "https://www.4d4y.com/forum/";
