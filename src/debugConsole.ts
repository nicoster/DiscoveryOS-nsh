// A debug console kept in memory only: nothing is written to disk. `dbg` also
// goes to the console, and the app shows the last lines behind a toggle.
const MAX_LINES = 200;
const lines: string[] = [];
const listeners = new Set<() => void>();

export function dbg(...parts: unknown[]): void {
  const line = `${new Date().toISOString().slice(11, 19)} ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}`;
  console.log(`DBG ${line}`);
  lines.push(line);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  for (const l of listeners) l();
}

export function debugLines(): string[] {
  return lines.slice();
}

export function onDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
