// Resolves a short link (b23.tv, v.douyin.com, ...) by following its redirect and reading
// the id out of the final URL. Each short link is resolved once. A resolve that takes longer
// than SHORT_LINK_TIMEOUT_MS gives up with null, so the caller can fall back to a WebView.
import { fetchLogged } from "./traffic";

export const SHORT_LINK_TIMEOUT_MS = 5000;

/**
 * A resolver for one kind of short link: `readFinalUrl` turns the URL the redirect ends on
 * into the value wanted (a video id), or undefined when that URL is not a video.
 */
export function shortLinkResolver<T>(readFinalUrl: (finalUrl: string) => T | undefined): (url: string) => Promise<T | null> {
  const resolved = new Map<string, Promise<T | null>>();
  return (url) => {
    let value = resolved.get(url);
    if (!value) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>((done) => {
        timer = setTimeout(() => done(null), SHORT_LINK_TIMEOUT_MS);
      });
      const followed = fetchLogged(url).then(
        ({ response }) => readFinalUrl(response.url) ?? null,
        () => null,
      );
      value = Promise.race([followed, timeout]).finally(() => clearTimeout(timer));
      resolved.set(url, value);
    }
    return value;
  };
}
