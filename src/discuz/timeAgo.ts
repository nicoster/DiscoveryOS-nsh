// "3 minutes ago" for the forum's times, as the Swift app's `fromNow()` shows
// them. The forum writes Beijing time (UTC+8) as "yyyy-MM-dd HH:mm", so the
// text is read as that zone, whatever the device's zone is.

const PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2})$/;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

const UNITS: [name: string, ms: number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/** The forum's time as a relative phrase; the text itself when it does not parse. */
export function timeAgo(text: string, now: number = Date.now()): string {
  const match = PATTERN.exec(text.trim());
  if (!match) return text;
  const [, y, mo, d, h, mi] = match.map(Number);
  const at = Date.UTC(y, mo - 1, d, h, mi) - BEIJING_OFFSET_MS;
  const diff = now - at;
  if (Number.isNaN(at)) return text;
  if (diff < 60 * 1000) return "now";
  for (const [name, ms] of UNITS) {
    const count = Math.floor(diff / ms);
    if (count >= 1) return `${count} ${name}${count === 1 ? "" : "s"} ago`;
  }
  return "now";
}
