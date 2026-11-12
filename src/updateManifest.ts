// The release manifest (`latest.json`) and what the update button says about it. Pure: no native modules, so
// it is testable on its own (`src/update.ts` fetches and applies updates).

export type Manifest = {
  id: string;
  build: number;
  version: string;
  url: string;
  sha256: string;
  // Revocation list (signed by the root), applied on every check.
  revocations?: string;
  // Short release notes for the update (the release commit's message); shown on the update button.
  notes?: string;
};

export const NOTES_MAX = 500;

/** The manifest, or `null` when it is not in the expected shape. Nothing in it is trusted beyond this. */
export function parseManifest(value: unknown): Manifest | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.version !== "string") return null;
  if (typeof v.build !== "number" || !Number.isInteger(v.build) || v.build < 1) return null;
  if (typeof v.url !== "string" || !v.url.startsWith("https://")) return null;
  if (typeof v.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(v.sha256)) return null;
  if (v.revocations !== undefined && (typeof v.revocations !== "string" || !v.revocations.startsWith("https://"))) return null;
  if (v.notes !== undefined && typeof v.notes !== "string") return null;
  return {
    id: v.id,
    build: v.build,
    version: v.version,
    url: v.url,
    sha256: v.sha256,
    revocations: v.revocations as string | undefined,
    notes: typeof v.notes === "string" ? v.notes.slice(0, NOTES_MAX) : undefined,
  };
}

/** The update button's tooltip: the build first (what the user needs to tell releases apart), then the notes. */
export function updateTitle(manifest: Manifest): string {
  const head = `Update to ${manifest.version} (build ${manifest.build})`;
  return manifest.notes ? `${head}\n${manifest.notes}` : head;
}
