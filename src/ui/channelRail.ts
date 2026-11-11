// The channel column folds into a rail of icons: by the user's choice (remembered
// between runs), and on its own when the window is too narrow for the full column.
import { Storage, signal } from "nsh";

const KEY = "visual:channels-collapsed";

/** Below this window width the channel column is always a rail. */
export const RAIL_BELOW = 860;
export const FULL_WIDTH = 228;
export const RAIL_WIDTH = 56;

const collapsed = signal(false);

Storage.getItem(KEY)
  .then((saved) => collapsed.set(saved === "1"))
  .catch(() => undefined);

/** Whether the user has folded the channel column (tracked). */
export const channelsCollapsed = () => collapsed();

/** Folds the channel column, or opens it again, and remembers it. */
export function toggleChannelsCollapsed(): void {
  const next = !collapsed();
  collapsed.set(next);
  Storage.setItem(KEY, next ? "1" : "0").catch(() => undefined);
}

/** Whether the channel column shows as a rail: folded by the user, or the window
 * is too narrow for the full column. */
export function channelsRailed(windowWidth: number, folded: boolean): boolean {
  return folded || windowWidth < RAIL_BELOW;
}
