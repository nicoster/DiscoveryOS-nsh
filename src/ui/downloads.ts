// Saving a post's file attachments into the Downloads folder. A press on an attachment's link
// starts the download; the toast says when it starts, when it is saved, and why it failed.
import { exists, mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { AttachmentError, fetchAttachment, safeFileName, splitFileName } from "../discuz/attachments";
import { dbg } from "../debugConsole";
import { notify } from "./toast";

const TOAST = "download";
// The files being fetched, by address: a second press on the same link waits for the first.
const inFlight = new Set<string>();

/**
 * Writes `bytes` into the Downloads folder under the file's name, with a number added when
 * the name is taken (`a.md`, `a (2).md`). Resolves to the path written.
 */
export async function saveToDownloads(name: string, bytes: Uint8Array): Promise<string> {
  const dir = `${homedir()}/Downloads`;
  await mkdir(dir, { recursive: true });
  const safe = safeFileName(name);
  const { stem, ext } = splitFileName(safe);
  let target = `${dir}/${safe}`;
  for (let n = 2; await exists(target); n++) target = `${dir}/${stem} (${n})${ext}`;
  await writeFile(target, bytes);
  return target;
}

/** Downloads the attachment at `url` (named `name`) into Downloads, and reports the outcome. */
export async function downloadAttachment(url: string, name: string): Promise<void> {
  if (inFlight.has(url)) return;
  inFlight.add(url);
  notify(TOAST, `Downloading ${name}…`);
  try {
    const bytes = await fetchAttachment(url, name);
    const path = await saveToDownloads(name, bytes);
    dbg("attachment saved", name, "bytes", bytes.length);
    notify(TOAST, `Saved ${path.split("/").pop()} to Downloads.`);
  } catch (e) {
    dbg("attachment failed", name, String(e));
    const reason = e instanceof AttachmentError ? `: ${e.message}` : "";
    notify(TOAST, `Couldn't download ${name}${reason}.`);
  } finally {
    inFlight.delete(url);
  }
}
