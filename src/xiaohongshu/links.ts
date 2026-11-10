// Finds the Xiaohongshu (小红书) notes a post links to. Notes open in the system
// browser: the app cannot show them in a WebView, because the site redirects the
// app's requests in a loop. Only the note links are read here.
import { htmlDecode } from "../discuz/parse";

// A note id is 24 lowercase hex characters; the share token after it is kept as the link has it.
const NOTE_LINK = /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:discovery\/item|explore)\/[0-9a-f]{24}[^\s"'<>]*/g;

/** The most Xiaohongshu cards shown under one post. */
export const MAX_XHS_PER_POST = 3;

/** The note links a post's HTML contains, in order, without repeats. `&amp;` in an href is decoded. */
export function xiaohongshuNoteLinks(html: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(NOTE_LINK)) {
    const link = htmlDecode(match[0]);
    if (link.length > 2048) continue;
    if (!links.includes(link)) links.push(link);
    if (links.length === MAX_XHS_PER_POST) break;
  }
  return links;
}
