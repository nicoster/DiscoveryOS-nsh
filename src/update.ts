// Hot update of this app's TSX: check the release manifest, download the signed package, and swap the
// running app for it (`Updater` in `src/update.rs` verifies the package before anything runs).
import { writeFile } from "fs/promises";
import { Updater } from "discoveryos/native";
import { notify } from "./ui/toast";

// The manifest of the latest release (uploaded with each `.nshpkg` by the release step).
export const UPDATE_MANIFEST_URL = "https://github.com/nicoster/DiscoveryOS-nsh/releases/latest/download/latest.json";

const TOAST = "update";
const CHECK_DELAY_MS = 3000;

export type Manifest = {
  id: string;
  build: number;
  version: string;
  url: string;
  sha256: string;
  // Revocation list (signed by the root), applied on every check.
  revocations?: string;
};

/** The manifest, or `null` when it is not in the expected shape. Nothing in it is trusted beyond this. */
export function parseManifest(value: unknown): Manifest | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.version !== "string") return null;
  if (typeof v.build !== "number" || !Number.isInteger(v.build) || v.build < 1) return null;
  if (typeof v.url !== "string" || !v.url.startsWith("https://")) return null;
  if (typeof v.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(v.sha256)) return null;
  if (v.revocations !== undefined && (typeof v.revocations !== "string" || !v.revocations.startsWith("https://"))) return null;
  return {
    id: v.id,
    build: v.build,
    version: v.version,
    url: v.url,
    sha256: v.sha256,
    revocations: v.revocations as string | undefined,
  };
}

/** The manifest's package, when it is newer than the running build; otherwise `null`. Applies the
 * manifest's revocation list first; a list that does not apply stops the update. */
export async function checkForUpdate(): Promise<Manifest | null> {
  const response = await fetch(UPDATE_MANIFEST_URL);
  if (!response.ok) throw new Error(`manifest: HTTP ${response.status}`);
  const manifest = parseManifest(await response.json());
  if (!manifest) throw new Error("manifest: unexpected shape");
  if (manifest.revocations) {
    const list = await fetch(manifest.revocations);
    if (!list.ok) throw new Error(`revocations: HTTP ${list.status}`);
    const result = Updater.applyRevocations(await list.text());
    if (result.startsWith("err")) throw new Error(result);
  }
  return manifest.build > Updater.currentBuild() ? manifest : null;
}

/** Downloads the package, then swaps the running app for it. Resolves with the result text. */
export async function installUpdate(manifest: Manifest): Promise<string> {
  const response = await fetch(manifest.url);
  if (!response.ok) throw new Error(`download: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = Updater.stagingPath(`build-${manifest.build}`);
  if (!path) throw new Error("no place to keep the download");
  await writeFile(path, bytes);
  return Updater.activate(path, manifest.sha256);
}

/** Once, shortly after start: check, and install a newer build when there is one. Failures stay quiet. */
export function startUpdateCheck(): void {
  setTimeout(() => {
    // This build is running: a package swapped in before is accepted now.
    const healthy = Updater.markHealthy();
    if (healthy.startsWith("err")) console.log(`update: ${healthy}`);
    checkForUpdate()
      .then((manifest) => {
        if (!manifest) return;
        notify(TOAST, `正在更新到 ${manifest.version}…`);
        return installUpdate(manifest).then((result) => {
          if (result.startsWith("err")) throw new Error(result);
        });
      })
      .catch((error: unknown) => {
        console.log(`update: ${error instanceof Error ? error.message : String(error)}`);
      });
  }, CHECK_DELAY_MS);
}
