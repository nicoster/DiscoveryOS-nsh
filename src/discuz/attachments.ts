// Saving a post's file attachments: the file name a download is saved under, and the
// download itself with the forum's session. The links are read by `attachmentLinks` in parse.ts.
import { HOST_BASE } from "./parse";
import { cookieHeader } from "./cookies";
import { USER_AGENT } from "./encoding";
import { fetchLogged } from "../net/traffic";

/** Largest file the app saves: the platform's write limit. */
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

/** A download the app could not finish; the message is for the user. */
export class AttachmentError extends Error {}

/** A file name a download can be saved under: no folders, control characters or leading dots, short. */
export function safeFileName(name: string): string {
  // Only the last part of the name: a name that carries folders must not leave the folder it is saved in.
  const base = name.split(/[\\/]/).pop() ?? "";
  // Control characters and characters a file system refuses.
  const cleaned = base.replace(/[\u0000-\u001f\u007f:*?"<>|]/g, "").replace(/^[.\s]+/, "").trim();
  if (!cleaned) return "download";
  const { stem, ext } = splitFileName(cleaned);
  const MAX = 180;
  const shortExt = ext.slice(0, MAX - 1);
  return stem.slice(0, Math.max(1, MAX - shortExt.length)) + shortExt;
}

/** Splits a file name into its stem and extension (`a.tar.gz` -> `a.tar`, `.gz`); no dot, no extension. */
export function splitFileName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: "" };
}

/**
 * The bytes of an attachment, with the forum's session cookies. A signed-out or refused
 * request comes back as the forum's HTML page, not the file, so an HTML answer is an error
 * unless the file itself is HTML.
 */
export async function fetchAttachment(url: string, name: string): Promise<Uint8Array> {
  const cookie = cookieHeader();
  const { response, bytes } = await fetchLogged(new URL(url, HOST_BASE).href, {
    headers: { "User-Agent": USER_AGENT, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!response.ok) throw new AttachmentError(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  const isPage = /text\/html/i.test(type) && !/\.html?$/i.test(name);
  if (isPage) throw new AttachmentError("the forum sent a page, not the file");
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new AttachmentError("the file is larger than 8 MB");
  return bytes;
}
