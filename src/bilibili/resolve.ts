// Resolves a Bilibili short link (b23.tv, bili2233.cn) to the video it points to.
import { shortLinkResolver } from "../net/shortLink";
import { bilibiliVideoIn } from "./links";

/** The video a short link leads to, or null when the redirect ends somewhere else, fails, or takes too long. */
export const resolveBiliShort = shortLinkResolver((finalUrl) => bilibiliVideoIn(finalUrl));
