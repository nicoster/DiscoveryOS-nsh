// Finds the Douyin videos a post links to. Every form is turned into the
// `jingxuan?modal_id=` page, the form the prototype played. `v.douyin.com`
// short links are not resolved yet.

const DOUYIN_LINK = /(?:www\.douyin\.com\/video\/|www\.douyin\.com\/jingxuan\?modal_id=|iesdouyin\.com\/share\/video\/)(\d{8,})/g;

/** The most Douyin players shown under one post. */
export const MAX_DOUYIN_PER_POST = 2;

/** The page to show for a Douyin video id. */
export const douyinPageUrl = (id: string) => `https://www.douyin.com/jingxuan?modal_id=${id}`;

/** The Douyin video ids a post's HTML links to, in order, without repeats. */
export function douyinVideoIds(html: string): string[] {
  const ids: string[] = [];
  for (const match of html.matchAll(DOUYIN_LINK)) {
    const id = match[1];
    if (!ids.includes(id)) ids.push(id);
    if (ids.length === MAX_DOUYIN_PER_POST) break;
  }
  return ids;
}
