// Resolves a Douyin short link (v.douyin.com) to the video id it points to, by following
// its redirect to the share page.
import { shortLinkResolver } from "../net/shortLink";
import { douyinIdIn } from "./links";

/** The video id a short link leads to, or null when the redirect ends somewhere else, fails, or takes too long. */
export const resolveDouyinShort = shortLinkResolver((finalUrl) => douyinIdIn(finalUrl));
