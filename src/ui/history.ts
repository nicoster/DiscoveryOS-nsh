// The threads the user has opened, kept in the app's storage on this device so the History
// list can show them. Newest first, one entry per thread, and capped at LIMIT entries.
import { Storage, signal } from "nsh";
import type { Post } from "../discuz/parse";
import type { HistoryEntry } from "./historyGroups";

const KEY = "history";
const LIMIT = 200;

export const historyEntries = signal<HistoryEntry[]>([]);
// Set once the history changes in this run, so a read from storage that finishes late
// does not overwrite a newer history.
let changedThisRun = false;

// Keeps only the entries that have the fields a row shows; anything else in storage is dropped.
function fromStorage(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: HistoryEntry[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const e = v as Partial<HistoryEntry>;
    const p = e.post as Partial<Post> | undefined;
    if (!p || typeof p.id !== "string" || typeof p.title !== "string" || typeof e.viewed !== "number") continue;
    out.push({ post: p as Post, viewed: e.viewed });
  }
  return out;
}

Storage.getItem(KEY)
  .then((saved) => {
    if (changedThisRun || !saved) return;
    historyEntries.set(fromStorage(JSON.parse(saved)));
  })
  .catch(() => undefined);

function save(list: HistoryEntry[]) {
  historyEntries.set(list);
  changedThisRun = true;
  Storage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
}

/** Records a thread as opened now: it moves to the top of the history, once. The row fields
 * are kept as the list showed them; a reply's excerpt and a pin do not belong in the history. */
export function recordView(post: Post, now: number = Date.now()): void {
  const kept: Post = {
    id: post.id,
    title: post.title,
    uid: post.uid,
    author: post.author,
    at: post.at,
    replies: post.replies,
    views: post.views,
    lastReplyBy: post.lastReplyBy,
    lastReplyAt: post.lastReplyAt,
    fid: post.fid,
  };
  const rest = historyEntries().filter((e) => e.post.id !== post.id);
  save([{ post: kept, viewed: now }, ...rest].slice(0, LIMIT));
}

/** Empties the history. */
export function clearHistory(): void {
  save([]);
}
