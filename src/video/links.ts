// Finds the video links a post has that no other module plays: a video page on a known
// site, or a video file (.mp4, .webm, .mov, .m3u8). Each one opens in a WebView
// (VideoLinkPlayer). Bilibili and Douyin links are found by their own modules.

/** The most video links shown under one post. */
export const MAX_VIDEO_LINKS_PER_POST = 3;

/** A video page on a known site: its host, and the path that is a video there. */
const SITE_PAGES: { host: RegExp; path: RegExp }[] = [
  { host: /^(www\.|m\.)?youtube\.com$/, path: /^\/(watch|shorts\/)/ },
  { host: /^(www\.)?vimeo\.com$/, path: /^\/\d+/ },
  { host: /^v\.youku\.com$/, path: /^\/v_show\// },
  { host: /^v\.qq\.com$/, path: /^\/x\/(page|cover)\// },
  { host: /(^|\.)iqiyi\.com$/, path: /^\/v_/ },
  { host: /(^|\.)ixigua\.com$/, path: /^\/\d+/ },
  { host: /(^|\.)kuaishou\.com$/, path: /^\/short-video\// },
  { host: /^video\.weibo\.com$/, path: /./ },
  { host: /(^|\.)weibo\.com$/, path: /^\/tv\/show\// },
  { host: /(^|\.)tiktok\.com$/, path: /^\/@[^/]+\/video\/\d+/ },
  { host: /(^|\.)(x|twitter)\.com$/, path: /^\/[^/]+\/status\/\d+/ },
];

const VIDEO_FILE = /\.(mp4|webm|mov|m3u8)$/i;

/** Whether one URL is a video link this module plays. */
export function isVideoLink(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (VIDEO_FILE.test(url.pathname)) return true;
  return SITE_PAGES.some((site) => site.host.test(url.hostname) && site.path.test(url.pathname));
}

/** The video links a post's HTML has, in order of first appearance, without repeats. */
export function videoLinksIn(html: string): string[] {
  const links: string[] = [];
  for (const match of html.replace(/&amp;/g, "&").matchAll(/https?:\/\/[^\s"'<>，。、）\]]+/g)) {
    const url = match[0];
    if (!isVideoLink(url) || links.includes(url)) continue;
    links.push(url);
    if (links.length === MAX_VIDEO_LINKS_PER_POST) break;
  }
  return links;
}
