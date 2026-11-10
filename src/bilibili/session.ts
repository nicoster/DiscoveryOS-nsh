// Whether the user is signed in to Bilibili. The login itself lives in the
// WebView's own cookie store: the app never reads or saves the cookies or the
// password. This flag only remembers the last check, so the UI can show the
// state before a check runs; every check asks Bilibili again.
import { signal, Storage } from "nsh";

const STORAGE_KEY = "bilibili:signedIn";

export const biliSignedIn = signal(false);

let loaded = false;

/** Reads the remembered flag once. */
export function loadBiliSession(): void {
  if (loaded) return;
  loaded = true;
  Storage.getItem(STORAGE_KEY)
    .then((value) => biliSignedIn.set(value === "1"))
    .catch(() => undefined);
}

/** Records the result of the latest check. */
export function setBiliSignedIn(value: boolean): void {
  biliSignedIn.set(value);
  Storage.setItem(STORAGE_KEY, value ? "1" : "0").catch(() => undefined);
}

/** Runs inside the login page (www.bilibili.com's API is same-site with it). It reports
 * through `window.nsh.postMessage`. Constant text only: nothing from the post goes in here. */
export const CHECK_LOGIN_JS = `
(async () => {
  try {
    const r = await fetch("https://api.bilibili.com/x/web-interface/nav", { credentials: "include" });
    const j = await r.json();
    window.nsh.postMessage(JSON.stringify({ kind: "login", isLogin: j?.data?.isLogin === true }));
  } catch (e) {
    window.nsh.postMessage(JSON.stringify({ kind: "login", error: String(e) }));
  }
})();`;

/** Reads a message from `CHECK_LOGIN_JS`. Anything else is an error, never a sign-in. */
export function parseLoginMessage(data: unknown): { isLogin: boolean } | { error: string } {
  try {
    const msg = JSON.parse(String(data));
    if (msg?.kind !== "login") return { error: "unexpected message" };
    if (typeof msg.error === "string") return { error: msg.error };
    return { isLogin: msg.isLogin === true };
  } catch {
    return { error: "unreadable message" };
  }
}
