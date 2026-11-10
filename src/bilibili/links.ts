// Finds the Bilibili videos a post links to. A video is played by its BV id or its
// av (aid) number; a `b23.tv` / `bili2233.cn` short link is kept as a URL, to be
// resolved to one of those ids first (see resolve.ts).

/** A video the player can take: by BV id or by av number. */
export type BiliVideoId = { bvid: string } | { aid: string };

/** A video a post links to: a known id, or a short link to resolve. */
export type BiliRef = BiliVideoId | { url: string };

/** The most videos shown under one post, so a long post cannot fill the screen with players. */
export const MAX_VIDEOS_PER_POST = 3;

const PATTERNS: { re: RegExp; ref: (m: RegExpMatchArray) => BiliRef }[] = [
  // www.bilibili.com/video/BV…, m.bilibili.com/video/BV…, with any query after it
  { re: /bilibili\.com\/video\/(BV[0-9A-Za-z]{10})/g, ref: (m) => ({ bvid: m[1] }) },
  // …/video/av170001
  { re: /bilibili\.com\/video\/av(\d{1,15})(?![0-9])/g, ref: (m) => ({ aid: m[1] }) },
  // player.bilibili.com/player.html?bvid=… or ?aid=…
  { re: /player\.bilibili\.com\/player\.html\?[^\s"'<>]*?bvid=(BV[0-9A-Za-z]{10})/g, ref: (m) => ({ bvid: m[1] }) },
  { re: /player\.bilibili\.com\/player\.html\?[^\s"'<>]*?aid=(\d{1,15})(?![0-9])/g, ref: (m) => ({ aid: m[1] }) },
  // b23.tv/xxxx and bili2233.cn/xxxx, with or without the scheme
  { re: /(?:https?:\/\/)?((?:b23\.tv|bili2233\.cn)\/[A-Za-z0-9]+)/g, ref: (m) => ({ url: `https://${m[1]}` }) },
];

/** The video a single URL or text points to, if it is a known Bilibili video form (not a short link). */
export function bilibiliVideoIn(text: string): BiliVideoId | undefined {
  for (const { re, ref } of PATTERNS) {
    const found = text.match(new RegExp(re.source));
    if (found) {
      const r = ref(found);
      if (!("url" in r)) return r;
    }
  }
  return undefined;
}

const keyOf = (ref: BiliRef) => ("url" in ref ? `url:${ref.url}` : "bvid" in ref ? `bvid:${ref.bvid}` : `aid:${ref.aid}`);

/** The Bilibili videos a post's HTML links to, in order of first appearance, without repeats. */
export function bilibiliRefs(html: string): BiliRef[] {
  const found: { at: number; ref: BiliRef }[] = [];
  for (const { re, ref } of PATTERNS) {
    for (const match of html.matchAll(re)) {
      found.push({ at: match.index ?? 0, ref: ref(match) });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const refs: BiliRef[] = [];
  const seen = new Set<string>();
  for (const { ref } of found) {
    const key = keyOf(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
    if (refs.length === MAX_VIDEOS_PER_POST) break;
  }
  return refs;
}
