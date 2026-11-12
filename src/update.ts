// Hot update of this app's TSX: check the release manifest, download the signed package, and keep it for
// the next start. The user applies it from the account row (`App.tsx`); `Updater` in `src/update.rs` verifies it.
import { writeFile } from "fs/promises";
import { signal } from "nsh";
import { Updater } from "discoveryos/native";

// The manifest of the latest release (uploaded with each `.nshpkg` by the release step).
export const UPDATE_MANIFEST_URL = "https://github.com/nicoster/DiscoveryOS-nsh/releases/latest/download/latest.json";

const CHECK_DELAY_MS = 3000;

/** Records what the last check did, for the About panel (kept by the native side). */
function record(result: string): void {
  Updater.recordCheck(`${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${result}`);
}

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

/** The package waiting for the user: downloaded and verified, applied by a click or at the next start. */
export const availableUpdate = signal<Manifest | null>(null);

/** Downloads the package, verifies it, and keeps it for the next start, without swapping the running app. */
async function download(manifest: Manifest): Promise<string> {
  const response = await fetch(manifest.url);
  if (!response.ok) throw new Error(`download: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = Updater.stagingPath(`build-${manifest.build}`);
  if (!path) throw new Error("no place to keep the download");
  await writeFile(path, bytes);
  const verified = Updater.verify(path);
  if (verified.startsWith("err")) throw new Error(verified);
  // The next start loads the kept package (`current.nshpkg`, verified again by the runner).
  const kept = Updater.stagingPath("current");
  if (!kept) throw new Error("no place to keep the package for the next start");
  await writeFile(kept, bytes);
  return path;
}

/** Swaps the running app for the downloaded package now. The button calls this. */
export async function installUpdate(manifest: Manifest): Promise<string> {
  const path = Updater.stagingPath(`build-${manifest.build}`);
  if (!path) throw new Error("no place to keep the download");
  return Updater.activate(path, manifest.sha256);
}

/** Once, shortly after start: accepts the last swapped package, then checks. A newer build is downloaded
 * and kept, and applies at the next start; it is never swapped in without the user. Failures stay quiet. */
export function startUpdateCheck(): void {
  setTimeout(() => {
    // This build is running: a package swapped in before is accepted now.
    const healthy = Updater.markHealthy();
    if (healthy.startsWith("err")) console.log(`update: ${healthy}`);
    checkForUpdate()
      .then(async (manifest) => {
        if (!manifest) {
          record("already up to date");
          return;
        }
        record(`downloading ${manifest.version} (build ${manifest.build})`);
        await download(manifest);
        availableUpdate.set(manifest);
        record(`${manifest.version} (build ${manifest.build}) ready; applies on restart`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        record(`failed: ${message}`);
        console.log(`update: ${message}`);
      });
  }, CHECK_DELAY_MS);
}
