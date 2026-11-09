// The channel and thread last open, kept in the app's storage so a launch reopens
// them (as the music player's queue and position survive a relaunch).
import { Storage } from "nsh";
import type { Channel, Post } from "../discuz/parse";

const STORAGE_KEY = "lastPlace";

export interface LastPlace {
  channel: Channel | null;
  thread: Post | null;
}

/** The saved place, or null when none is saved or it cannot be read. */
export function loadLastPlace(): Promise<LastPlace | null> {
  return Storage.getItem(STORAGE_KEY)
    .then((text) => {
      if (!text) return null;
      const value = JSON.parse(text) as Partial<LastPlace>;
      return { channel: value.channel ?? null, thread: value.thread ?? null };
    })
    .catch(() => null);
}

/** Saves the place now open. Failures are ignored: the place is a convenience. */
export function saveLastPlace(place: LastPlace) {
  Storage.setItem(STORAGE_KEY, JSON.stringify(place)).catch(() => undefined);
}
