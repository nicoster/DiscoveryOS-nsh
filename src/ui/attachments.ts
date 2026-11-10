// The pictures and files a post takes from a paste or a drop: each is uploaded to the forum as it
// arrives, in the order it came, and shown in the reply box until the post goes. The reply and the new
// thread share this one; each passes its own upload.
import { signal, type PasteEvent } from "nsh";
import { Files } from "discoveryos/native";
import { pixelSize, type PixelSize } from "./pixelSize";
import { notify } from "./toast";
import type { Attached } from "./ReplyBox";

/** A picture by its name or its type; anything else is a file. */
export const isPicture = (name: string, type: string) => type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(name);

/** The BBCode a post carries for an uploaded attachment: `[attachimg]` for a picture, `[attach]` for a file. */
export const attachmentTag = (a: Attached) => (a.kind === "image" ? `[attachimg]${a.id}[/attachimg]` : `[attach]${a.id}[/attach]`);

// The picture as a data URL, to show it in the reply box.
async function previewOf(file: File): Promise<{ preview: string; size: PixelSize | null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { preview: `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`, size: pixelSize(bytes) };
}

// Reads the files at these `file:` URLs. The system resolves a file copied in Finder (a file
// reference) to its path, and the native module reads it; a dropped file's URL is its path.
async function readUris(uris: string[], failed: string): Promise<File[]> {
  const files: File[] = [];
  for (const uri of uris) {
    const path = Files.path(uri);
    const bytes = path ? Files.read(path) : null;
    if (path && bytes) {
      files.push(new File([bytes], path.split("/").pop() || "file", { type: "" }));
      continue;
    }
    try {
      const name = decodeURIComponent(uri.split("/").pop() ?? "");
      const blob = await fetch(uri).then((r) => r.blob());
      files.push(new File([blob], name, { type: blob.type || "" }));
    } catch (err) {
      notify("paste-error", failed);
    }
  }
  return files;
}

/**
 * The attachments of one post being written. `upload` sends a file to the forum and resolves with its
 * attachment id. Uploads run one at a time, in the order pasted; a paste during an upload waits its turn.
 * `uploadFailed` names the file for the message shown when an upload fails.
 */
export function createAttachments(upload: (file: File, kind: "image" | "file") => Promise<string>, uploadFailed: (name: string) => string, pasteFailed: string) {
  const uploading = signal(false);
  // Pictures pasted into the post: uploaded already, shown as thumbnails, sent as tags with the post.
  const attachments = signal<Attached[]>([]);
  // Each one is added to the attachments as soon as its upload finishes; it has no remove control.
  let pendingUploads = 0;
  let uploadQueue: Promise<void> = Promise.resolve();
  function attachFiles(files: File[]) {
    for (const file of files) {
      pendingUploads += 1;
      uploading.set(true);
      uploadQueue = uploadQueue.then(async () => {
        try {
          const picture = isPicture(file.name, file.type);
          const { preview, size } = picture ? await previewOf(file) : { preview: "", size: null };
          const kind = picture ? "image" : "file";
          const id = await upload(file, kind);
          attachments.set([...attachments(), { id, kind, name: file.name, preview, size }]);
        } catch (e) {
          notify("upload-error", uploadFailed(file.name));
        } finally {
          pendingUploads -= 1;
          uploading.set(pendingUploads > 0);
        }
      });
    }
  }

  async function onPaste(e: PasteEvent) {
    attachFiles([...e.files, ...(await readUris(e.uris, pasteFailed))]);
  }

  async function onFileDrop(uris: string[]) {
    attachFiles(await readUris(uris, pasteFailed));
  }

  return { attachments, uploading, onPaste, onFileDrop };
}
