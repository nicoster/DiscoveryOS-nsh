// Finds the Douyin videos a post links to. A video is played by its id, on the
// `jingxuan?modal_id=` page. A `v.douyin.com` short link is kept as a URL, to be
// resolved to an id first (see resolve.ts).

/** A video a post links to: a known id, or a short link to resolve. */
export type DouyinRef = { id: string } | { url: string };

/** The most Douyin players shown under one post. */
export const MAX_DOUYIN_PER_POST = 2;

/** The page a Douyin video id plays on. */
export const douyinPageUrl = (id: string) => `https://www.douyin.com/jingxuan?modal_id=${id}`;

const PATTERNS: { re: RegExp; ref: (m: RegExpMatchArray) => DouyinRef }[] = [
  // www.douyin.com/video/<id> (also m.douyin.com, douyin.com)
  { re: /douyin\.com\/video\/(\d{8,})/g, ref: (m) => ({ id: m[1] }) },
  // any douyin.com page that carries modal_id=<id>, e.g. jingxuan, discover, user/…
  { re: /douyin\.com\/[^\s"'<>]*?[?&]modal_id=(\d{8,})/g, ref: (m) => ({ id: m[1] }) },
  // iesdouyin.com/share/video/<id>, douyin.com/share/video/<id>
  { re: /(?:iesdouyin|douyin)\.com\/share\/video\/(\d{8,})/g, ref: (m) => ({ id: m[1] }) },
  // v.douyin.com/<code>/, with or without the scheme
  { re: /(?:https?:\/\/)?(v\.douyin\.com\/[A-Za-z0-9_-]+)/g, ref: (m) => ({ url: `https://${m[1]}/` }) },
];

/** The video id a single URL points to, if it is a known Douyin video form (not a short link). */
export function douyinIdIn(text: string): string | undefined {
  for (const { re, ref } of PATTERNS) {
    const found = text.match(new RegExp(re.source));
    if (found) {
      const r = ref(found);
      if ("id" in r) return r.id;
    }
  }
  return undefined;
}

/** The Douyin videos a post's HTML links to, in order of first appearance, without repeats. */
export function douyinRefs(html: string): DouyinRef[] {
  const found: { at: number; ref: DouyinRef }[] = [];
  for (const { re, ref } of PATTERNS) {
    for (const match of html.matchAll(re)) {
      found.push({ at: match.index ?? 0, ref: ref(match) });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const refs: DouyinRef[] = [];
  const seen = new Set<string>();
  for (const { ref } of found) {
    const key = "id" in ref ? `id:${ref.id}` : `url:${ref.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
    if (refs.length === MAX_DOUYIN_PER_POST) break;
  }
  return refs;
}
