// The saved login (`CurrentUserStore`). It lives in the shared vault item
// (`vault.ts`) next to the session cookies. The Swift app stored `user:pass`
// under its own item; that item is not read any more.
import { loadVault, saveVault, type Credentials } from "./vault";

export type { Credentials };

export function loadCredentials(): Credentials | null {
  return loadVault().creds;
}

export function saveCredentials(creds: Credentials): void {
  saveVault({ ...loadVault(), creds: { name: creds.name, pass: creds.pass } });
}

export function clearCredentials(): void {
  saveVault({ ...loadVault(), creds: null });
}
