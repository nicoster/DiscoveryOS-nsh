// A thread's replies, pages, quote and reply draft (`PostDetailView` of the
// Swift app). The draft is kept per thread in the app's storage.
import { List, signal, Storage, Text, View, type PasteEvent } from "nsh";
import { TextView } from "nsh/base";
import { HOST, postReply, uploadImage } from "../discuz/client";
import { bookmarkPost, loadReplyPage, removeBookmark } from "../discuz/forum";
import { absolutize, absoluteUrl, buildQuote, fixImages, mergePage, threadIdFromLink, trimLeadingBlanks, type Post, type Reply } from "../discuz/parse";
import { dbg } from "../debugConsole";
import { timeAgo } from "../discuz/timeAgo";
import { LoadingBar } from "./LoadingBar";
import { Failure } from "./Failure";
import { notify } from "./toast";
import { palette } from "./appearance";
import { titleBarShown } from "./TitleBar";
import { BubbleIcon, StarIcon } from "./icons";
import { ReplyCard } from "./ReplyCard";
import { ReplyBox } from "./ReplyBox";
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
  const error = signal<string | null>(null);
  // The page whose load failed, so Retry asks for that page again.
  const failedPage = signal<number | null>(null);
  const draft = signal("");
  const sending = signal(false);
  const uploading = signal(false);
  // Whether the thread is in the favorites: the shared list, which the thread lists star from.
  const saved = () => isFavorite(props.post.id);

  let loadingMore = false;
  const loadingMoreShown = signal(false);

  function fetchPage(n: number) {
    failedPage.set(null);
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
        failedPage.set(n);
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
    await Storage.setItem(draftKey(props.post.id), text);
  }

  async function send() {
    sending.set(true);
    error.set(null);
    try {
      await postReply(fid(), props.post.id, draft());
      notify("reply", "Reply posted.");
      await setDraft("");
      replies.set([]);
      more.set(true);
      fetchPage(1);
    } catch (e) {
      dbg("post failed", props.post.id, String(e));
      error.set("Couldn't send your reply. Try again.");
    } finally {
      sending.set(false);
    }
  }

  // Uploads pasted images one at a time, in the order pasted. Each image's tag is
  // appended to the draft as soon as its upload finishes, so deleting a tag drops
  // that image from the reply. A paste during an upload waits its turn.
  let pendingUploads = 0;
  let uploadQueue: Promise<void> = Promise.resolve();
  function attachFiles(files: File[]) {
    for (const file of files) {
      pendingUploads += 1;
      uploading.set(true);
      uploadQueue = uploadQueue.then(async () => {
        try {
          error.set(null);
          const tag = `[attachimg]${await uploadImage(fid(), props.post.id, file)}[/attachimg]`;
          await setDraft(draft() ? `${draft()}\n${tag}` : tag);
        } catch (e) {
          dbg("upload failed", file.name, String(e));
          error.set(`Couldn't upload ${file.name}. Try again.`);
        } finally {
          pendingUploads -= 1;
          uploading.set(pendingUploads > 0);
        }
      });
    }
  }

  // A paste's images: the image files (a screenshot, an image copied from a page
  // or app) and the image files copied in a file manager, read from their `file:` URLs.
  async function onPaste(e: PasteEvent) {
    const files = e.files.filter((f) => f.type.startsWith("image/"));
    for (const uri of e.uris) {
      const name = decodeURIComponent(uri.split("/").pop() ?? "");
      if (!/\.(png|jpe?g|gif|webp|heic)$/i.test(name)) continue;
      try {
        const blob = await fetch(uri).then((r) => r.blob());
        files.push(new File([blob], name, { type: blob.type || "image/jpeg" }));
      } catch (err) {
        dbg("read failed", name, String(err));
        error.set(`Couldn't read ${name}.`);
      }
    }
    attachFiles(files);
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
          error.set("Couldn't remove from favorites. Try again.");
        }
      } else if (await bookmarkPost(props.post.id)) {
        markFavorite(props.post.id, true, props.post.lastReplyAt ?? props.post.at);
        notify("favorite", "Added to favorites.");
      }
    } catch (e) {
      dbg("favorite failed", props.post.id, String(e));
      error.set("Couldn't update favorites. Try again.");
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
      {error() ? <Text style={{ fontSize: 13, color: palette().danger, padding: 12 }}>{error()}</Text> : null}
      {failedPage() !== null ? <Failure message="Couldn't load replies." onRetry={() => fetchPage(failedPage()!)} /> : null}
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
        <ReplyBox draft={() => draft()} onDraft={(text) => setDraft(text)} sending={() => sending()} uploading={() => uploading()} onSend={send} onPaste={onPaste} />
      ) : null}
    </View>
  );
}
