// Links inside a post that point at one floor of the forum, in the order they appear. A post can
// carry the forum's own `findpost` redirect (the address the app copies for a floor), or a
// `viewthread.php` link with a `pid` in its query or in its `#pid…` anchor. A plain thread link
// names no floor, so it is not a post link. Quote blocks are left out: the forum already draws
// their arrow as a quote, and a preview of it would only repeat what the reader sees.
import { bodyWithoutQuote, floorFromLink, htmlDecode, HOST_BASE } from "./parse";
import { TRAILING_PUNCTUATION } from "./shortLinks";

/** A link to one floor: the post, its thread, and the address that was found. */
export type PostLink = { pid: string; ptid: string; url: string };

/** The address the app copies for one floor: Discuz's own findpost redirect. */
export function floorLinkUrl(pid: string, tid: string): string {
  return `${HOST_BASE}redirect.php?goto=findpost&pid=${pid}&ptid=${tid}`;
}

const HREF = /\bhref\s*=\s*"([^"]*)"/i;
// A bare address in the post's text stops at spaces, tags, quotes and CJK punctuation, as the
// reader sees it (`linkBareUrls` uses the same boundary when it turns one into a link).
const URL_IN_TEXT = /https?:\/\/[^\s<>"'\u3000-\u303f\uff00-\uffef]+/gi;
const PID_ANCHOR = /^#pid(\d+)$/i;

const isForumHost = (host: string) => host === "4d4y.com" || host.endsWith(".4d4y.com");
const isDigits = (s: string | null | undefined): s is string => !!s && /^\d+$/.test(s);

/** The floor an address points at, if any. Relative addresses are read against the forum's base. */
export function postLinkFromUrl(href: string, base = HOST_BASE): PostLink | undefined {
  let url: URL;
  try {
    url = new URL(htmlDecode(href.trim()), base);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (!isForumHost(url.hostname)) return undefined;
  // The forum's own floor link: `redirect.php?goto=findpost&pid=…&ptid=…`.
  const floor = floorFromLink(url.href);
  if (floor) return { ...floor, url: url.href };
  // A thread page that opens at a floor: `viewthread.php?tid=…#pid…`, `…&pid=…`, or the
  // `forum.php?mod=viewthread&tid=…&pid=…` form.
  const isThread =
    /(^|\/)viewthread\.php$/.test(url.pathname) ||
    (/(^|\/)forum\.php$/.test(url.pathname) && url.searchParams.get("mod") === "viewthread");
  const tid = url.searchParams.get("tid");
  const inQuery = url.searchParams.get("pid");
  const pid = isDigits(inQuery) ? inQuery : PID_ANCHOR.exec(url.hash)?.[1];
  if (!isThread || !isDigits(tid) || !isDigits(pid)) return undefined;
  return { pid, ptid: tid, url: url.href };
}

/**
 * The post links in a post's HTML, in the order they appear, one card per floor. Both links the
 * forum marked up (`<a href>`) and bare addresses in the text are read; the same floor linked
 * twice gives one card. Quote blocks are skipped (see the note at the top of this file).
 */
export function postLinksIn(html: string, base = HOST_BASE): PostLink[] {
  const out: PostLink[] = [];
  const seen = new Set<string>();
  const parts = withoutQuoteBlocks(html).split(/(<[^>]*>)/);
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i];
    const candidates: string[] = [];
    if (i % 2 === 1) {
      // A tag: only an anchor's href is a link. A picture's src or a script is not.
      if (/^<a\b/i.test(piece)) {
        const href = HREF.exec(piece)?.[1];
        if (href) candidates.push(href);
      }
    } else {
      for (const match of piece.matchAll(URL_IN_TEXT)) candidates.push(match[0].replace(TRAILING_PUNCTUATION, ""));
    }
    for (const raw of candidates) {
      const link = postLinkFromUrl(raw, base);
      if (!link) continue;
      const key = `${link.ptid}:${link.pid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(link);
    }
  }
  return out;
}

// `bodyWithoutQuote` takes out one quote block. Nested quotes are taken out one level at a time;
// a block the parser cannot close leaves the rest of the post alone rather than looping forever.
function withoutQuoteBlocks(html: string): string {
  let out = html;
  for (let i = 0; i < 10; i++) {
    const next = bodyWithoutQuote(out);
    if (next === out) break;
    out = next;
  }
  return out;
}
