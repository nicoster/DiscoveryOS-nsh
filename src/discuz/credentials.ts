// The saved login (`CurrentUserStore`): kept in the Keychain as JSON. The Swift
// app stored `user:pass` and split on `:`, which breaks a password with a colon.
import { Keychain } from "discoveryos/native";

const ACCOUNT = "cred";

export type Credentials = { name: string; pass: string };

export function loadCredentials(): Credentials | null {
  const raw = Keychain.load(ACCOUNT);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v?.name === "string" && typeof v?.pass === "string" ? v : null;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  Keychain.save(ACCOUNT, JSON.stringify(creds));
}

export function clearCredentials(): void {
  Keychain.delete(ACCOUNT);
}
