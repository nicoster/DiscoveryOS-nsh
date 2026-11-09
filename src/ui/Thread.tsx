// A thread's replies, pages, quote and reply draft (`PostDetailView` of the
// Swift app). The draft is kept per thread in the app's storage.
import { List, signal, Storage, Text, View, type PasteEvent } from "nsh";
import { TextView } from "nsh/base";
import { HOST, postReply, ReplyRefused, uploadAttachment } from "../discuz/client";
import { bookmarkPost, loadReplyPage, removeBookmark } from "../discuz/forum";
import { absolutize, absoluteUrl, buildQuote, fixImages, mergePage, threadIdFromLink, trimLeadingBlanks, type Post, type Reply } from "../discuz/parse";
import { dbg } from "../debugConsole";
import { timeAgo } from "../discuz/timeAgo";
import { LoadingBar } from "./LoadingBar";
import { notify } from "./toast";
import { palette } from "./appearance";
import { titleBarShown } from "./TitleBar";
import { BubbleIcon, StarIcon } from "./icons";
import { ReplyCard } from "./ReplyCard";
import { ReplyBox, type Attached } from "./ReplyBox";
import { canSendReply } from "./replyGate";
import { pixelSize, type PixelSize } from "./pixelSize";

// A picture by its name or its type; anything else is a file.
const isPicture = (name: string, type: string) => type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(name);
import { isFavorite, markFavorite } from "./favorites";

const draftKey = (tid: string) => `draft:${tid}`;

// The thread's title shows in the header at the large size; the first post's
// own heading (its title, in the body) takes the small size the header had.
const OP_TITLE_STYLES = {
  heading: { fontSize: 16, fontWeight: 500 },
  heading1: { fontSize: 16, fontWeight: 500 },
  heading2: { fontSize: 16, fontWeight: 500 },
  heading3: { fontSize: 16, fontWeight: 500 },
} as const;

// `signedIn` gates what needs an account: the favorite star, quoting and replying.
// `onOpenThread` takes a press on a link to another 4d4y thread; `onBack` shows a Back control
// (a thread opened from a link, whose title and forum come from its first page).
export function Thread(props: {
  fid: string;
  post: Post;
  signedIn?: boolean;
  onUnfavorited?: () => void;
  onOpenThread?: (tid: string) => void;
  onBack?: () => void;
}) {
  // The title and forum: the post's own, or those the first page names for a thread opened from a link.
  const title = signal(props.post.title);
  const fid = signal(props.fid);
  const replies = signal<Reply[]>([]);
  const page = signal(1);
  const more = signal(true);
  // Messages for actions that failed (a reply, a picture, favorites): one plain line each.
  // The page whose load failed, so Retry asks for that page again.
  const draft = signal("");
  const sending = signal(false);
  const uploading = signal(false);
  // Pictures pasted into the reply: uploaded already, shown as thumbnails, sent as tags with the reply.
  const attachments = signal<Attached[]>([]);
  // Whether the thread is in the favorites: the shared list, which the thread lists star from.
  const saved = () => isFavorite(props.post.id);

  let loadingMore = false;
  const loadingMoreShown = signal(false);

  function fetchPage(n: number) {
    loadReplyPage(props.post.id, n)
      .then(({ title: pageTitle, fid: pageFid, replies: list }) => {
        if (n === 1 && pageTitle) title.set(pageTitle);
        if (n === 1 && pageFid && !fid()) fid.set(pageFid);
        for (const r of list) {
          const fixed = fixImages(r.body);
          dbg("reply", r.seq, "pictures", (fixed.match(/<img\b/gi) ?? []).length, "srcs", (fixed.match(/<img\b[^>]*src="[^"]*"/gi) ?? []).map((t) => t.replace(/^.*src="/, "").slice(-60)));
        }
        const merged = n === 1 ? { items: list, more: list.length > 0 } : mergePage(replies(), list);
        replies.set(merged.items);
        more.set(merged.more);
        page.set(n);
      })
      .catch((e) => {
        dbg("replies failed", props.post.id, "page", n, String(e));
        notify("replies-error", "Couldn't load replies. Tap to retry.", () => fetchPage(n));
      })
      .finally(() => {
        loadingMore = false;
        loadingMoreShown.set(false);
      });
  }

  function loadMore() {
    if (loadingMore || !more()) return;
    loadingMore = true;
    loadingMoreShown.set(true);
    fetchPage(page() + 1);
  }

  async function setDraft(text: string) {
    draft.set(text);
    // A draft that cannot be saved (storage full) is a convenience lost, not a failed action.
    await Storage.setItem(draftKey(props.post.id), text).catch((e) => dbg("draft not saved", String(e)));
  }

  async function send() {
    if (!canSendReply(draft()) || sending() || uploading()) return;
    // The reply's text, then the pictures as their tags.
    const body = [draft(), ...attachments().map((a) => (a.kind === "image" ? `[attachimg]${a.id}[/attachimg]` : `[attach]${a.id}[/attach]`))].join("\n");
    sending.set(true);
    dbg("reply send", props.post.id, "fid", fid(), "chars", draft().length);
    try {
      await postReply(fid(), props.post.id, body);
      dbg("reply posted", props.post.id);
      notify("reply", "Reply posted.");
      attachments.set([]);
      await setDraft("");
      dbg("reply draft cleared", props.post.id);
    } catch (e) {
      dbg("post failed", props.post.id, String(e));
      // The forum's own refusal (e.g. the 30-second limit) is shown as it words it.
      notify("reply-error", e instanceof ReplyRefused ? e.message : "Couldn't send your reply. Try again.");
    } finally {
      sending.set(false);
    }
    // Reload the replies whether or not the post reported success: the server may have kept
    // the reply even when its answer was unclear, and the list should show what it holds.
    dbg("reply refresh", props.post.id, "page 1");
    replies.set([]);
    more.set(true);
    fetchPage(1);
  }

  // The picture as a data URL, to show it in the reply box.
  async function previewOf(file: File): Promise<{ preview: string; size: PixelSize | null }> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { preview: `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`, size: pixelSize(bytes) };
  }

  // Uploads pasted files one at a time, in the order pasted. Each one is added to the
  // attachments as soon as its upload finishes, and it goes with the reply: it has no
  // remove control. A paste during an upload waits its turn. A picture is uploaded as an
  // image and shown as a thumbnail; any other file is uploaded as a file and shown by name.
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
          const id = await uploadAttachment(fid(), props.post.id, file, kind);
          attachments.set([...attachments(), { id, kind, name: file.name, preview, size }]);
        } catch (e) {
          dbg("upload failed", file.name, String(e));
          notify("upload-error", `Couldn't upload ${file.name}. Try again.`);
        } finally {
          pendingUploads -= 1;
          uploading.set(pendingUploads > 0);
        }
      });
    }
  }

  // A paste's images: the image files (a screenshot, an image copied from a page
  // or app) and the image files copied in a file manager, read from their `file:` URLs.
  // Reads the files at these `file:` URLs. A file copied in Finder comes as a file reference
  // that cannot be read here; a dropped file's own path can.
  async function readUris(uris: string[]): Promise<File[]> {
    const files: File[] = [];
    for (const uri of uris) {
      const name = decodeURIComponent(uri.split("/").pop() ?? "");
      if (!name) continue;
      try {
        const blob = await fetch(uri).then((r) => r.blob());
        files.push(new File([blob], name, { type: blob.type || "application/octet-stream" }));
      } catch (err) {
        dbg("read failed", uri, String(err));
        notify("paste-error", "Can't attach that file. Try dragging it into the box.");
      }
    }
    return files;
  }

  async function onPaste(e: PasteEvent) {
    attachFiles([...e.files, ...(await readUris(e.uris))]);
  }

  async function onFileDrop(uris: string[]) {
    attachFiles(await readUris(uris));
  }

  function quote(r: Reply) {
    const text = buildQuote(HOST, { id: props.post.id, title: title() }, r) + draft();
    setDraft(text);
  }

  // Adds the thread to the favorites, or removes it when it is saved.
  async function toggleFavorite() {
    try {
      if (saved()) {
        if (await removeBookmark(props.post.id)) {
          markFavorite(props.post.id, false);
          notify("favorite", "Removed from favorites.");
          props.onUnfavorited?.();
        } else {
          notify("favorite-error", "Couldn't remove from favorites. Try again.");
        }
      } else if (await bookmarkPost(props.post.id)) {
        markFavorite(props.post.id, true, props.post.lastReplyAt ?? props.post.at);
        notify("favorite", "Added to favorites.");
      }
    } catch (e) {
      dbg("favorite failed", props.post.id, String(e));
      notify("favorite-error", "Couldn't update favorites. Try again.");
    }
  }

  // Load the first page and the saved draft once.
  fetchPage(1);
  Storage.getItem(draftKey(props.post.id))
    .then((text) => draft.set(text ?? ""))
    .catch(() => undefined);

  return (
    <View style={{ flex: 1, alignSelf: "stretch" }}>
      {/* Under the title bar the title sits in the bar's caption area (the column extends up into it), centred
          on the bar's 44pt; it drags the window where nothing presses. With no bar, it keeps the top inset. */}
      <View
        desktop={{ windowDrag: true }}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, padding: 12, paddingTop: titleBarShown() ? 10.5 : 12 }}
      >
        {props.onBack ? (
          <View onPress={props.onBack} accessibilityLabel="Back" style={{ position: "absolute", left: 12, paddingVertical: 4, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 13, color: palette().muted }}>{"‹ Back"}</Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 22, fontWeight: 600, color: palette().text }}>{title()}</Text>
        {props.signedIn ? (
          <View onPress={toggleFavorite} accessibilityLabel={saved() ? "Remove from favorites" : "Add to favorites"}>
            {saved() ? <StarIcon size={20} filled={true} /> : <StarIcon size={20} />}
          </View>
        ) : null}
      </View>
      {/* A virtualized list: only the replies near the viewport exist, and their views are
          reused as the user scrolls. Each row reads its reply through `item()`. */}
      <List
        style={{ flex: 1 }}
        contentStyle={{ padding: 12, gap: 12 }}
        each={replies()}
        estimatedItemSize={180}
        onLoadMore={loadMore}
        footer={() => <View>{loadingMoreShown() ? <LoadingBar /> : null}</View>}
      >
        {(item) => (
          <ReplyCard
            avatar={item().author.avatar ? absoluteUrl(item().author.avatar!, HOST) : undefined}
            name={item().author.name}
            meta={`#${item().seq} · ${timeAgo(item().at)}`}
            trailing={
              props.signedIn ? (
                <View onPress={() => quote(item())} accessibilityLabel="Quote">
                  <BubbleIcon size={16} />
                </View>
              ) : null
            }
            body={
              <TextView
                html={absolutize(trimLeadingBlanks(fixImages(item().body)), HOST)}
                styles={item().seq === 1 ? OP_TITLE_STYLES : undefined}
                onLinkPress={(e) => {
                  // A 4d4y thread link opens in this column; any other link is left as it was.
                  const tid = threadIdFromLink(e.url);
                  if (tid && props.onOpenThread) props.onOpenThread(tid);
                }}
              />
            }
          />
        )}
      </List>
      {/* The Send button sits inside the reply box, under the text, at its right edge. Signed out, there is no reply box. */}
      {props.signedIn ? (
        <ReplyBox
          onFileDrop={onFileDrop}
          draft={() => draft()}
          onDraft={(text) => setDraft(text)}
          sending={() => sending()}
          uploading={() => uploading()}
          attachments={() => attachments()}
          canSend={() => canSendReply(draft())}
          onSend={send}
          onPaste={onPaste}
        />
      ) : null}
    </View>
  );
}
