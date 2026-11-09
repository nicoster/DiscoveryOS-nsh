// The session's cookies, kept in the Keychain so a launch resumes the login
// without asking for the password again. Discuz sets its session (`*_auth`,
// `*_saltkey`, ...) with `Set-Cookie`; we keep name=value pairs only.
import { Keychain } from "discoveryos/native";

const ACCOUNT = "session-cookies";

const jar = new Map<string, string>();
let loaded = false;

/** Loads the saved cookies once. */
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const raw = Keychain.load(ACCOUNT);
  if (!raw) return;
  try {
    const entries = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(entries)) jar.set(k, v);
  } catch {
    // A damaged entry is ignored; the next login writes a fresh one.
  }
}

/** The `Cookie` header for the stored cookies, or `undefined` when there are none. */
export function cookieHeader(): string | undefined {
  ensureLoaded();
  if (jar.size === 0) return undefined;
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Applies `Set-Cookie` lines to a jar: stores name=value pairs, and drops a
 * cookie the server expires (an empty value or a past date). Returns whether
 * the jar changed. */
export function applySetCookie(target: Map<string, string>, setCookies: string[]): boolean {
  let changed = false;
  for (const line of setCookies) {
    const [pair, ...attrs] = line.split(";").map((s) => s.trim());
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const expired = attrs.some((a) => /^expires=/i.test(a) && Date.parse(a.slice(8)) < Date.now());
    if (value === "" || expired) {
      changed = target.delete(name) || changed;
    } else {
      changed = target.get(name) !== value || changed;
      target.set(name, value);
    }
  }
  return changed;
}

/** Takes the `Set-Cookie` values of a response into the saved jar. */
export function absorbSetCookie(setCookies: string[]): void {
  ensureLoaded();
  if (applySetCookie(jar, setCookies)) save();
}

function save(): void {
  Keychain.save(ACCOUNT, JSON.stringify(Object.fromEntries(jar)));
}

/** Forgets all cookies, in memory and in the Keychain. */
export function clearCookies(): void {
  jar.clear();
  loaded = true;
  Keychain.delete(ACCOUNT);
}

/** Whether a session cookie was saved (a restore may skip the password). */
export function hasSavedCookies(): boolean {
  ensureLoaded();
  return jar.size > 0;
}
