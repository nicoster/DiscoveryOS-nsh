// A thread's replies, pages, quote and reply draft (`PostDetailView` of the
// Swift app). The draft is kept per thread in the app's storage.
import { Image, Scroll, signal, Storage, Text, View, type PasteEvent } from "nsh";
import { Input, TextView } from "nsh/base";
import { HOST, postReply, uploadImage } from "../discuz/client";
import { bookmarkPost, loadReplies, removeBookmark } from "../discuz/forum";
import { absolutize, absoluteUrl, buildQuote, fixImages, mergePage, trimLeadingBlanks, type Post, type Reply } from "../discuz/parse";
import { dbg } from "../debugConsole";
import { timeAgo } from "../discuz/timeAgo";
import { nearEnd } from "./nearEnd";
import { LoadingBar } from "./LoadingBar";
import { palette } from "./appearance";
import { BubbleIcon, PlaneIcon, StarIcon } from "./icons";

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
export function Thread(props: { fid: string; post: Post; favorited?: boolean; signedIn?: boolean; onUnfavorited?: () => void }) {
  const replies = signal<Reply[]>([]);
  const page = signal(1);
  const more = signal(true);
  const error = signal<string | null>(null);
  const draft = signal("");
  const sending = signal(false);
  const uploading = signal(false);
  // Whether the thread is in the favorites: known from the list it was opened
  // from (`favorited`), else learned by adding it.
  const saved = signal<boolean | null>(props.favorited ?? null);

  let loadingMore = false;
  const loadingMoreShown = signal(false);

  function fetchPage(n: number) {
    loadReplies(props.post.id, n)
      .then((list) => {
        for (const r of list) {
          const fixed = fixImages(r.body);
          dbg("reply", r.seq, "pictures", (fixed.match(/<img\b/gi) ?? []).length, "srcs", (fixed.match(/<img\b[^>]*src="[^"]*"/gi) ?? []).map((t) => t.replace(/^.*src="/, "").slice(-60)));
        }
        const merged = n === 1 ? { items: list, more: list.length > 0 } : mergePage(replies(), list);
        replies.set(merged.items);
        more.set(merged.more);
        page.set(n);
      })
      .catch((e) => error.set(`Could not load replies: ${e}`))
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
      await postReply(props.fid, props.post.id, draft());
      await setDraft("");
      replies.set([]);
      more.set(true);
      fetchPage(1);
    } catch (e) {
      error.set(`Could not post: ${e}`);
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
          const tag = `[attachimg]${await uploadImage(props.fid, props.post.id, file)}[/attachimg]`;
          await setDraft(draft() ? `${draft()}\n${tag}` : tag);
        } catch (e) {
          error.set(`Could not upload ${file.name}: ${e}`);
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
        error.set(`Could not read ${name}: ${err}`);
      }
    }
    attachFiles(files);
  }

  function quote(r: Reply) {
    const text = buildQuote(HOST, { id: props.post.id, title: props.post.title }, r) + draft();
    setDraft(text);
  }

  // Adds the thread to the favorites, or removes it when it is saved.
  async function toggleFavorite() {
    try {
      if (saved() === true) {
        if (await removeBookmark(props.post.id)) {
          saved.set(false);
          props.onUnfavorited?.();
        } else {
          error.set("Could not remove from favorites");
        }
      } else {
        saved.set(await bookmarkPost(props.post.id));
      }
    } catch (e) {
      error.set(`Could not change favorites: ${e}`);
    }
  }

  // Load the first page and the saved draft once.
  fetchPage(1);
  Storage.getItem(draftKey(props.post.id))
    .then((text) => draft.set(text ?? ""))
    .catch(() => undefined);

  return (
    <View style={{ flex: 1, alignSelf: "stretch" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, padding: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: 600, color: palette().text }}>{props.post.title}</Text>
        {props.signedIn ? (
          <View onPress={toggleFavorite} accessibilityLabel={saved() ? "Remove from favorites" : "Add to favorites"}>
            {saved() ? <StarIcon size={20} filled={true} /> : <StarIcon size={20} />}
          </View>
        ) : null}
      </View>
      {error() ? <Text style={{ fontSize: 13, color: palette().danger, padding: 12 }}>{error()}</Text> : null}
      <Scroll
        style={{ flex: 1 }}
        contentStyle={{ padding: 12, gap: 12 }}
        onScroll={(e) => {
          if (nearEnd(e)) loadMore();
        }}
      >
        {replies().map((r) => (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 8, backgroundColor: palette().surface }}>
            {/* Two columns, as the Swift app: the avatar on the left, and beside it the
                meta line over the body, so the body starts under the name. */}
            {r.author.avatar ? (
              <Image src={absoluteUrl(r.author.avatar, HOST)} style={{ width: 36, height: 36, borderRadius: 6 }} />
            ) : (
              <View style={{ width: 36 }} />
            )}
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 13, color: palette().text }}>{r.author.name}</Text>
                <Text style={{ fontSize: 12, color: palette().muted }}>{`#${r.seq} · ${timeAgo(r.at)}`}</Text>
                {props.signedIn ? (
                  <View onPress={() => quote(r)} accessibilityLabel="Quote">
                    <BubbleIcon size={16} />
                  </View>
                ) : null}
              </View>
              <TextView html={absolutize(trimLeadingBlanks(fixImages(r.body)), HOST)} styles={r.seq === 1 ? OP_TITLE_STYLES : undefined} />
            </View>
          </View>
        ))}
        {loadingMoreShown() ? <LoadingBar /> : null}
      </Scroll>
      {/* The Send button sits inside the reply box, under the text, at its right edge. Signed out, there is no reply box. */}
      {props.signedIn ? (
      <View style={{ alignSelf: "stretch", margin: 12, padding: 8, gap: 4, borderRadius: 8, backgroundColor: palette().surface }}>
        <Input
          placeholder="Reply"
          multiline={true}
          value={draft()}
          onChange={(text: string) => setDraft(text)}
          onPaste={onPaste}
          style={{ minHeight: 56, padding: 4, fontSize: 14, backgroundColor: "transparent" }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          {uploading() ? <Text style={{ fontSize: 12, color: palette().muted }}>Uploading…</Text> : null}
          <View
            onPress={sending() || uploading() || draft().length === 0 ? undefined : send}
            accessibilityLabel="Send"
            style={{ padding: 4 }}
          >
            <PlaneIcon size={18} enabled={() => !sending() && draft().length > 0} />
          </View>
        </View>
      </View>
      ) : null}
    </View>
  );
}
