// Caches each user's avatar for a day, in the app's storage, so the forum is
// not asked again on every launch: the profile lookup (the avatar's address)
// and the picture itself (as a `data:` URL, which the Image view shows).
// A picture the server refuses is remembered as missing for an hour, and a
// lookup or download already under way is shared by every caller that asks.
import { Storage } from "nsh";
import { loadUser } from "./forum";
import { absoluteUrl, HOST_BASE } from "./parse";
import { fetchLogged } from "../net/traffic";

const TTL_MS = 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 60 * 60 * 1000;

type Entry = { avatar: string; at: number };
type PictureEntry = { data?: string; missing?: boolean; at: number };

const userKey = (name: string) => `avatar:${name}`;
const pictureKey = (url: string) => `avatar-image:${url}`;

// The requests under way, by key: callers that ask for the same name or picture share one.
const inFlight = new Map<string, Promise<unknown>>();

function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const request = load().finally(() => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

/** The avatar's absolute address of `name`, `undefined` when the user has none. */
export function userAvatar(name: string): Promise<string | undefined> {
  return shared(`user:${name}`, async () => {
    const cached = await readEntry<Entry>(userKey(name));
    if (cached && fresh(cached, TTL_MS)) return cached.avatar ? absoluteUrl(cached.avatar, HOST_BASE) : undefined;
    const user = await loadUser(name);
    const avatar = user?.avatar ?? "";
    await Storage.setItem(userKey(name), JSON.stringify({ avatar, at: Date.now() } satisfies Entry)).catch(() => undefined);
    return avatar ? absoluteUrl(avatar, HOST_BASE) : undefined;
  });
}

/** The picture at `url` as a `data:` URL, from the cache while it is fresh. Rejects when the server has no picture there. */
export function avatarPicture(url: string): Promise<string> {
  return shared(`picture:${url}`, async () => {
    const cached = await readEntry<PictureEntry>(pictureKey(url));
    if (cached?.data && fresh(cached, TTL_MS)) return cached.data;
    if (cached?.missing && fresh(cached, MISSING_TTL_MS)) throw new Error(`No picture at ${url}`);
    const { response, bytes } = await fetchLogged(url);
    if (!response.ok) {
      // A refused picture (404 and the like) is remembered, so the next list does not ask again at once.
      await Storage.setItem(pictureKey(url), JSON.stringify({ missing: true, at: Date.now() } satisfies PictureEntry)).catch(() => undefined);
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const type = response.headers.get("content-type") ?? "image/jpeg";
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const data = `data:${type};base64,${btoa(binary)}`;
    await Storage.setItem(pictureKey(url), JSON.stringify({ data, at: Date.now() } satisfies PictureEntry)).catch(() => undefined);
    return data;
  });
}

const fresh = (entry: { at: number }, ttl: number) => Date.now() - entry.at < ttl;

async function readEntry<T extends { at: number }>(key: string): Promise<T | undefined> {
  try {
    const raw = await Storage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<T>;
    if (typeof parsed.at !== "number") return undefined;
    return parsed as T;
  } catch {
    return undefined;
  }
}
