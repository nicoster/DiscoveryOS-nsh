// The session's cookies, kept in the Keychain (in the shared vault, `vault.ts`)
// so a launch resumes the login without asking for the password again. Discuz
// sets its session (`*_auth`, `*_saltkey`, ...) with `Set-Cookie`; we keep
// name=value pairs only.
import process from "process";
import { loadVault, saveVault } from "./vault";

/** Debug only: the environment variable whose cookies are imported at first use. */
export const COOKIE_ENV = "DISCUZ_COOKIES";

const jar = new Map<string, string>();
let loaded = false;

/** Loads the saved cookies once, then applies `DISCUZ_COOKIES` on top when it is set. */
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  for (const [k, v] of Object.entries(loadVault().cookies)) jar.set(k, v);
  const env = process.env[COOKIE_ENV];
  if (env) {
    const imported = parseCookieText(env);
    for (const [k, v] of imported) jar.set(k, v);
    if (imported.size > 0) save();
  }
}

/**
 * Parses cookies from text: either a JSON object (`{"name":"value"}`, as
 * `exportCookies` writes) or a `Cookie` header (`a=1; b=2`). Unusable entries
 * are skipped.
 */
export function parseCookieText(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) if (typeof v === "string" && k) out.set(k, v);
    } catch {
      // Not JSON after all: nothing usable.
    }
    return out;
  }
  for (const part of trimmed.split(";")) {
    const pair = part.trim();
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    out.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return out;
}

/** Debug: the saved cookies as a JSON object text. It holds the session secrets, so do not log it. */
export function exportCookies(): string {
  ensureLoaded();
  return JSON.stringify(Object.fromEntries(jar), null, 2);
}

/** Debug: replaces the saved cookies with the given text (JSON or `Cookie` header). Returns how many were imported. */
export function importCookies(text: string): number {
  ensureLoaded();
  const imported = parseCookieText(text);
  if (imported.size === 0) return 0;
  jar.clear();
  for (const [k, v] of imported) jar.set(k, v);
  save();
  return imported.size;
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
  saveVault({ ...loadVault(), cookies: Object.fromEntries(jar) });
}

/** Forgets all cookies, in memory and in the Keychain. */
export function clearCookies(): void {
  jar.clear();
  loaded = true;
  saveVault({ ...loadVault(), cookies: {} });
}

/** Whether a session cookie was saved (a restore may skip the password). */
export function hasSavedCookies(): boolean {
  ensureLoaded();
  return jar.size > 0;
}
