// Console output for debugging. It is off unless the environment sets DEBUG=1 when the app
// starts; the name is granted to `process.env` in `nsh.json`.
import process from "process";

export const debugEnabled: boolean = process.env.DEBUG === "1";

/** `console.log`, but only when `DEBUG=1`. */
export function consoleDebug(...args: unknown[]): void {
  if (debugEnabled) console.log(...args);
}
