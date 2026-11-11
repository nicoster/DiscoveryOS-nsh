// A thread's replies, pages, quote and reply draft (`PostDetailView` of the
// Swift app). The draft is kept per thread in the app's storage.
import { keymap, List, signal, Storage, Text, View, type PasteEvent, type ListRef } from "nsh";
import { TextView } from "nsh/base";
import { HOST, postReply, ReplyRefused, uploadAttachment } from "../discuz/client";
import { bookmarkPost, loadReplyPage, removeBookmark } from "../discuz/forum";
import { absolutize, absoluteUrl, attachmentLinks, buildQuote, fixImages, isAttachmentUrl, mergePage, threadIdFromLink, trimLeadingBlanks, type Post, type Reply } from "../discuz/parse";
import { downloadAttachment } from "./downloads";
import { useCommand } from "./commands";
import { openLink } from "./links";
import { timeAgo } from "../discuz/timeAgo";
import { LoadingBar } from "./LoadingBar";
import { notify } from "./toast";
import { palette } from "./appearance";
import { titleBarShown } from "./TitleBar";
import { BubbleIcon, StarIcon } from "./icons";
import { ReplyCard } from "./ReplyCard";
import { ReplyBox } from "./ReplyBox";
import { attachmentTag, createAttachments } from "./attachments";
import { hint } from "./Hint";
import { canSendReply } from "./replyGate";
import { bilibiliRefs } from "../bilibili/links";
import { BiliPlayer, BiliShortPlayer } from "./BiliPlayer";
import { douyinRefs } from "../douyin/links";
import { DouyinPlayer, DouyinShortPlayer } from "./DouyinPlayer";
import { xiaohongshuNoteLinks } from "../xiaohongshu/links";
import { XhsCard } from "./XhsCard";

// A picture by its name or its type; anything else is a file.
import { isFavorite, markFavorite } from "./favorites";

const draftKey = (tid: string) => `draft:${tid}`;

// How long a `g` waits for the second `g` of `gg`.
const G_WAIT_MS = 1000;

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
// `shortcutsOpen` says the Forum's shortcut list is open, which pauses these keys.
export function Thread(props: {
  fid: string;
  post: Post;
  signedIn?: boolean;
  onUnfavorited?: () => void;
  onOpenThread?: (tid: string) => void;
  onBack?: () => void;
  shortcutsOpen?: () => boolean;
}) {
  // The title and forum: the post's own, or those the first page names for a thread opened from a link.
  const title = signal(props.post.title);
  const fid = signal(props.fid);
  const replies = signal<Reply[]>([]);
  const page = signal(1);
  const more = signal(true);
  // The page whose load failed (its message and Refresh button show in the thread), or null.
  const failedPage = signal<number | null>(null);
  // Messages for actions that failed (a reply, a picture, favorites): one plain line each.
  // The page whose load failed, so Retry asks for that page again.
  const draft = signal("");
  const sending = signal(false);
  // Whether the thread is in the favorites: the shared list, which the thread lists star from.
  const saved = () => isFavorite(props.post.id);

  let loadingMore = false;
  const loadingMoreShown = signal(false);

  function fetchPage(n: number) {
    loadReplyPage(props.post.id, n)
      .then(({ title: pageTitle, fid: pageFid, replies: list }) => {
        if (n === 1 && pageTitle) title.set(pageTitle);
        if (n === 1 && pageFid && !fid()) fid.set(pageFid);
        const merged = n === 1 ? { items: list, more: list.length > 0 } : mergePage(replies(), list);
        replies.set(merged.items);
        more.set(merged.more);
        page.set(n);
        failedPage.set(null);
      })
      .catch((e) => {
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
    // A draft that cannot be saved (storage full) is a convenience lost, not a failed action.
    await Storage.setItem(draftKey(props.post.id), text).catch(() => undefined);
  }

  async function send() {
    if (!canSendReply(draft()) || sending() || uploading()) return;
    // The reply's text, then the pictures as their tags.
    const body = [draft(), ...attachments().map(attachmentTag)].join("\n");
    sending.set(true);
    try {
      await postReply(fid(), props.post.id, body);
      notify("reply", "Reply posted.");
      attachments.set([]);
      await setDraft("");
    } catch (e) {
      // The forum's own refusal (e.g. the 30-second limit) is shown as it words it.
      notify("reply-error", e instanceof ReplyRefused ? e.message : "Couldn't send your reply. Try again.");
    } finally {
      sending.set(false);
    }
    // Reload the replies whether or not the post reported success: the server may have kept
    // the reply even when its answer was unclear, and the list should show what it holds.
    replies.set([]);
    more.set(true);
    fetchPage(1);
  }

  // Pictures and files pasted or dropped into the reply: uploaded to the thread, sent as tags with the reply.
  const { attachments, uploading, onPaste, onFileDrop } = createAttachments(
    (file, kind) => uploadAttachment(fid(), props.post.id, file, kind),
    (name) => `Couldn't upload ${name}. Try again.`,
    "Can't attach that file. Try dragging it into the box.",
  );

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
      notify("favorite-error", "Couldn't update favorites. Try again.");
    }
  }

  // The post page's keys (the Forum's `?` lists them). A single key never fires while a text field
  // has the focus, so typing a reply is safe; they are off while the list is open.
  // The reply under the pointer is highlighted; `q` quotes it.
  const hovered = signal<number | null>(null);
  // The thread's author (楼主) is the poster of floor #1, once the first page has loaded.
  const opId = () => replies().find((r) => r.seq === 1)?.author.id;
  // The Forum's shortcut list, open over the window: the keys are off while it is.
  const keysOn = () => !props.shortcutsOpen?.();
  let replyField: { focus(): void } | undefined;
  let repliesList: ListRef | undefined;
  let gPending: ReturnType<typeof setTimeout> | undefined;

  const goTop = () => repliesList?.scrollToOffset({ offset: 0, animated: true });
  // `g g` is a chord of two presses, so it is bound here rather than through the command's keys.
  keymap.bind(
    "g",
    () => {
      if (!keysOn()) return;
      if (gPending !== undefined) {
        clearTimeout(gPending);
        gPending = undefined;
        goTop();
        return;
      }
      gPending = setTimeout(() => {
        gPending = undefined;
      }, G_WAIT_MS);
    },
    { when: "notEditing" },
  );
  useCommand("thread.top", { enabled: keysOn, run: goTop });
  useCommand("thread.bottom", {
    enabled: keysOn,
    run: () => repliesList?.scrollToEnd({ animated: true }),
  });
  useCommand("thread.reply", {
    enabled: () => keysOn() && !!props.signedIn,
    run: () => replyField?.focus(),
  });
  useCommand("thread.favorite", {
    enabled: () => keysOn() && !!props.signedIn,
    checked: saved,
    run: () => void toggleFavorite(),
  });
  useCommand("thread.quote", {
    enabled: () => keysOn() && !!props.signedIn && replies().some((r) => r.seq === hovered()),
    run: () => {
      const target = replies().find((r) => r.seq === hovered());
      if (!target) return;
      quote(target);
      replyField?.focus();
    },
  });

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
          <View
            onPress={toggleFavorite}
            accessibilityLabel={saved() ? "Remove from favorites" : "Add to favorites"}
            tooltip={hint(saved() ? "取消收藏 (f)" : "收藏 (f)")}
          >
            {saved() ? <StarIcon size={20} filled={true} /> : <StarIcon size={20} />}
          </View>
        ) : null}
      </View>
      {failedPage() !== null ? (
        <View style={{ alignItems: "center", padding: 16, gap: 8 }}>
          <Text style={{ fontSize: 13, color: palette().muted }}>Couldn't load replies.</Text>
          <View
            onPress={() => fetchPage(failedPage()!)}
            accessibilityLabel="Refresh"
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: palette().border }}
          >
            <Text style={{ fontSize: 13, color: palette().text }}>Refresh</Text>
          </View>
        </View>
      ) : null}
      {/* A virtualized list: only the replies near the viewport exist, and their views are
          reused as the user scrolls. Each row reads its reply through `item()`. */}
      <List
        style={{ flex: 1 }}
        contentStyle={{ padding: 12, gap: 12 }}
        each={replies()}
        estimatedItemSize={180}
        onLoadMore={loadMore}
        footer={() => <View>{loadingMoreShown() ? <LoadingBar /> : null}</View>}
        ref={(n: ListRef | null) => {
          repliesList = n ?? undefined;
        }}
      >
        {(item) => (
          <ReplyCard
            avatar={item().author.avatar ? absoluteUrl(item().author.avatar!, HOST) : undefined}
            name={item().author.name}
            isOp={opId() !== undefined && item().author.id === opId()}
            meta={`#${item().seq} · ${timeAgo(item().at)}`}
            highlighted={() => hovered() === item().seq}
            onHoverIn={() => hovered.set(item().seq)}
            onHoverOut={() => {
              if (hovered() === item().seq) hovered.set(null);
            }}
            trailing={
              props.signedIn ? (
                <View onPress={() => quote(item())} accessibilityLabel="Quote" tooltip={hint("引用 (q)")}>
                  <BubbleIcon size={16} />
                </View>
              ) : null
            }
            body={
              <View style={{ gap: 12, alignSelf: "stretch" }}>
                <TextView
                  html={absolutize(trimLeadingBlanks(fixImages(item().body)), HOST)}
                  styles={item().seq === 1 ? OP_TITLE_STYLES : undefined}
                  onLinkPress={(e) => {
                    // A 4d4y thread link opens in this column; a file the post attaches is saved to Downloads;
                    // any other link opens in the system browser.
                    const tid = threadIdFromLink(e.url);
                    if (tid && props.onOpenThread) {
                      props.onOpenThread(tid);
                    } else if (isAttachmentUrl(e.url)) {
                      const file = attachmentLinks(item().body).find((a) => absoluteUrl(a.url, HOST) === e.url);
                      void downloadAttachment(e.url, file?.name ?? "download");
                    } else {
                      void openLink(e.url);
                    }
                  }}
                />
                {/* Bilibili videos the post links to play under its text (the text view cannot show a player). */}
                {bilibiliRefs(item().body).map((ref) => ("url" in ref ? <BiliShortPlayer url={ref.url} /> : <BiliPlayer video={ref} />))}
                {douyinRefs(item().body).map((ref) => ("url" in ref ? <DouyinShortPlayer url={ref.url} /> : <DouyinPlayer id={ref.id} />))}
                {xiaohongshuNoteLinks(item().body).map((link) => (
                  <XhsCard link={link} />
                ))}
              </View>
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
          fieldRef={(field) => {
            replyField = field;
          }}
        />
      ) : null}
    </View>
  );
}
