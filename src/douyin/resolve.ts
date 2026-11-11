// Resolves a Douyin short link (v.douyin.com) to the video id it points to, by
// following its redirect to the share page. Each short link is resolved once.
import { fetchLogged } from "../net/traffic";
import { douyinIdIn } from "./links";

const resolved = new Map<string, Promise<string | null>>();

/** The video id a short link leads to, or null when the redirect ends somewhere else. */
export function resolveDouyinShort(url: string): Promise<string | null> {
  let id = resolved.get(url);
  if (!id) {
    id = fetchLogged(url).then(
      ({ response }) => douyinIdIn(response.url) ?? null,
      () => null,
    );
    resolved.set(url, id);
  }
  return id;
}
