// The user's favorites, kept in the app's storage so the thread lists can star them
// without loading the favorites first. Each entry is a thread id with the day of its
// last reply, which is the order the favorites page sorts by.
//
// The favorites page is newest-first by last reply and loads a page at a time. So the
// loaded list covers every favorite whose last reply is later than its oldest day
// (`bottom`): such a favorite, if still a favorite, must be on the list. A saved
// favorite inside that range but missing from the list has been removed, and is
// dropped. Days are compared, not times, since a page may give a day alone.
import { Storage, signal } from "nsh";
import type { Post } from "../discuz/parse";
import { forumDay } from "../discuz/timeAgo";

const KEY = "favoriteIds";

export interface Favorite {
  id: string;
  /** The day of the thread's last reply ("yyyy-MM-dd"), or null when not known. */
  day: string | null;
}

const favorites = signal<Favorite[]>([]);
// Set once the list changes in this run, so a read from storage that finishes late
// does not overwrite a newer list.
let changedThisRun = false;

// Reads both the saved shape and the plain id list an earlier run saved.
function fromStorage(value: unknown): Favorite[] {
  if (!Array.isArray(value)) return [];
  const out: Favorite[] = [];
  for (const v of value) {
    if (typeof v === "string") out.push({ id: v, day: null });
    else if (v && typeof v === "object" && typeof (v as Favorite).id === "string") {
      const day = (v as Favorite).day;
      out.push({ id: (v as Favorite).id, day: typeof day === "string" ? day : null });
    }
  }
  return out;
}

Storage.getItem(KEY)
  .then((saved) => {
    if (changedThisRun || !saved) return;
    favorites.set(fromStorage(JSON.parse(saved)));
  })
  .catch(() => undefined);

function save(list: Favorite[]) {
  favorites.set(list);
  changedThisRun = true;
  Storage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
}

/** Whether the thread is in the favorites (tracked). */
export const isFavorite = (tid: string) => favorites().some((f) => f.id === tid);

/**
 * Brings the saved favorites in line with a loaded favorites list, newest first.
 * `list` is every page loaded so far; `complete` is true when no page is left after it.
 * Favorites on the list are saved with their day. A saved favorite missing from the
 * list is dropped when the list is complete, or when its day is later than the list's
 * oldest day (the list would have shown it). Unknown days are kept.
 */
export function reconcileFavorites(list: Post[], complete: boolean): void {
  save(reconcile(favorites(), list, complete));
}

/** The saved favorites after a loaded list: see `reconcileFavorites`. Pure, for tests. */
export function reconcile(saved: Favorite[], list: Post[], complete: boolean): Favorite[] {
  const onList = new Set(list.map((p) => p.id));
  const days = list.map((p) => forumDay(p.lastReplyAt ?? p.at)).filter((d): d is string => d !== null);
  const bottom = days.length > 0 ? days.reduce((a, b) => (a < b ? a : b)) : null;
  const kept = saved.filter((f) => {
    if (onList.has(f.id) || complete) return false;
    if (bottom === null || f.day === null) return true;
    return f.day <= bottom;
  });
  const fresh: Favorite[] = list.map((p) => ({
    id: p.id,
    day: forumDay(p.lastReplyAt ?? p.at) ?? saved.find((f) => f.id === p.id)?.day ?? null,
  }));
  return [...fresh, ...kept];
}

/** Records one thread as a favorite (with its last-reply time when known), or as no longer one. */
export function markFavorite(tid: string, favorite: boolean, lastReply?: string): void {
  const rest = favorites().filter((f) => f.id !== tid);
  save(favorite ? [...rest, { id: tid, day: forumDay(lastReply) }] : rest);
}

/** Forgets every favorite (sign-out). */
export function clearFavoriteIds(): void {
  save([]);
}
