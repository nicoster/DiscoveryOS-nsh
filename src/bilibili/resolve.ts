// Resolves a Bilibili short link (b23.tv, bili2233.cn) to the video it points to, by
// following its redirect. Each short link is resolved once.
import { fetchLogged } from "../net/traffic";
import { bilibiliVideoIn, type BiliVideoId } from "./links";

const resolved = new Map<string, Promise<BiliVideoId | null>>();

/** The video a short link leads to, or null when the redirect ends somewhere else. */
export function resolveBiliShort(url: string): Promise<BiliVideoId | null> {
  let video = resolved.get(url);
  if (!video) {
    video = fetchLogged(url).then(
      ({ response }) => bilibiliVideoIn(response.url) ?? null,
      () => null,
    );
    resolved.set(url, video);
  }
  return video;
}
