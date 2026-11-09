// Caches each user's avatar for a day, in the app's storage, so the forum is
// not asked again on every launch: the profile lookup (the avatar's address)
// and the picture itself (as a `data:` URL, which the Image view shows).
import { Storage } from "nsh";
import { loadUser } from "./forum";
import { absoluteUrl, HOST_BASE } from "./parse";

const TTL_MS = 24 * 60 * 60 * 1000;

type Entry = { avatar: string; at: number };
type PictureEntry = { data: string; at: number };

const userKey = (name: string) => `avatar:${name}`;
const pictureKey = (url: string) => `avatar-image:${url}`;

/** The avatar's absolute address of `name`, `undefined` when the user has none. */
export async function userAvatar(name: string): Promise<string | undefined> {
  const cached = await readEntry<Entry>(userKey(name));
  if (cached && fresh(cached)) return cached.avatar ? absoluteUrl(cached.avatar, HOST_BASE) : undefined;
  const user = await loadUser(name);
  const avatar = user?.avatar ?? "";
  await Storage.setItem(userKey(name), JSON.stringify({ avatar, at: Date.now() } satisfies Entry)).catch(() => undefined);
  return avatar ? absoluteUrl(avatar, HOST_BASE) : undefined;
}

/** The picture at `url` as a `data:` URL, from the cache while it is fresh. */
export async function avatarPicture(url: string): Promise<string> {
  const cached = await readEntry<PictureEntry>(pictureKey(url));
  if (cached && fresh(cached)) return cached.data;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const type = response.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const data = `data:${type};base64,${btoa(binary)}`;
  await Storage.setItem(pictureKey(url), JSON.stringify({ data, at: Date.now() } satisfies PictureEntry)).catch(() => undefined);
  return data;
}

const fresh = (entry: { at: number }) => Date.now() - entry.at < TTL_MS;

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
