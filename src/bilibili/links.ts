// Finds the Bilibili videos a post links to, by BV id. Only the canonical
// `bilibili.com/video/BV…` form is read for now; `b23.tv` short links and `av`
// numbers are not resolved yet.

const BV_LINK = /bilibili\.com\/video\/(BV[0-9A-Za-z]{10})/g;

/** The most videos shown under one post, so a long post cannot fill the screen with players. */
export const MAX_VIDEOS_PER_POST = 3;

/** The BV ids a post's HTML links to, in order of first appearance, without repeats. */
export function bilibiliVideoIds(html: string): string[] {
  const ids: string[] = [];
  for (const match of html.matchAll(BV_LINK)) {
    const id = match[1];
    if (!ids.includes(id)) ids.push(id);
    if (ids.length === MAX_VIDEOS_PER_POST) break;
  }
  return ids;
}
