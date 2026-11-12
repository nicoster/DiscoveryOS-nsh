// Debug logging to a file. Start the app with `DISCO_DEBUG=/path/to/disco.log` set to a file path; the native
// side (`src/debug_log.rs`) checks the path once and appends to it. Unset, or not a usable file path: off.
import { DebugLog } from "discoveryos/native";

/** The log file, or `null` when debugging is off. */
export const debugLogPath: string | null = DebugLog.path();

export const debugEnabled: boolean = debugLogPath !== null;

/** Appends the arguments to the debug log, one line with a timestamp, when debugging is on. */
export function consoleDebug(...args: unknown[]): void {
  if (!debugEnabled) return;
  const text = args.map((arg) => (typeof arg === "string" ? arg : String(arg))).join(" ");
  DebugLog.write(`${new Date().toISOString()} ${text}`);
}
