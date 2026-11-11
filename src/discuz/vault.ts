// The one Keychain item for everything the app keeps between launches: the saved
// login and the session cookies. macOS asks for approval on each item it reads,
// so keeping both in one item means a launch asks once instead of once per item.
// The item is read at most once per launch and then served from memory.
import { Keychain } from "discoveryos/native";

const ACCOUNT = "session";

export type Credentials = { name: string; pass: string };

export type Vault = {
  creds: Credentials | null;
  cookies: Record<string, string>;
};

/** Parses the stored JSON. A missing or damaged item reads as empty. */
export function parseVault(raw: string | null): Vault {
  if (!raw) return { creds: null, cookies: {} };
  try {
    const v = JSON.parse(raw) as Partial<Vault> | null;
    const c = v?.creds as Partial<Credentials> | null | undefined;
    const creds =
      c && typeof c.name === "string" && typeof c.pass === "string" ? { name: c.name, pass: c.pass } : null;
    const cookies: Record<string, string> = {};
    if (v?.cookies && typeof v.cookies === "object") {
      for (const [k, val] of Object.entries(v.cookies)) {
        if (typeof val === "string") cookies[k] = val;
      }
    }
    return { creds, cookies };
  } catch {
    return { creds: null, cookies: {} };
  }
}

let cache: Vault | null = null;

/** The stored vault; the Keychain is read only on the first call. */
export function loadVault(): Vault {
  if (!cache) cache = parseVault(Keychain.load(ACCOUNT));
  return cache;
}

/** Replaces the stored vault and writes it to the Keychain. */
export function saveVault(next: Vault): void {
  cache = next;
  Keychain.save(ACCOUNT, JSON.stringify(next));
}
