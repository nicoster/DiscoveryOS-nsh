// A thread's replies, pages, quote and reply draft (`PostDetailView` of the
// Swift app). The draft is kept per thread in the app's storage.
import { keymap, List, signal, Storage, Text, View, type PasteEvent, type ListRef } from "nsh";
import { Dialog, TextView } from "nsh/base";
import { currentUser, deletePost, editPost, HOST, loadEditForm, postReply, ReplyRefused, uploadAttachment, uploadEditAttachment, type EditForm } from "../discuz/client";
import { bookmarkPost, clearThreadReplyPages, loadFloorPage, loadReplyPage, removeBookmark } from "../discuz/forum";
import { absolutize, absoluteUrl, attachmentLinks, fixDiscuzMarkup, fixImages, floorFromLink, isAttachmentUrl, mergePage, threadIdFromLink, trimLeadingBlanks, type Post, type Reply } from "../discuz/parse";
import { draftToPost, postToDraft, replyQuoteInDraft } from "../discuz/quote";
import { downloadAttachment } from "./downloads";
import { DISCUZ_EXTENSIONS, renderDiscuzNode } from "./discuzMarkup";
import { useCommand } from "./commands";
import { openLink } from "./links";
import { timeAgo } from "../discuz/timeAgo";
import { LoadingBar } from "./LoadingBar";
import { notify } from "./toast";
import { palette } from "./appearance";
import { titleBarShown } from "./TitleBar";
import { BrowserIcon, BubbleIcon, PencilIcon, StarIcon, TrashIcon } from "./icons";
import { ReplyCard } from "./ReplyCard";
import { ReplyBox } from "./ReplyBox";
import { attachmentTag, createAttachments } from "./attachments";
import type { Attached } from "./ReplyBox";
import { hint } from "./Hint";
import { canSendReply } from "./replyGate";
import { bilibiliRefs } from "../bilibili/links";
import { BiliPlayer, BiliShortPlayer } from "./BiliPlayer";
import { douyinRefs } from "../douyin/links";
import { DouyinPlayer, DouyinShortPlayer } from "./DouyinPlayer";
import { xiaohongshuNoteLinks } from "../xiaohongshu/links";
import { videoLinksIn } from "../video/links";
import { VideoLinkPlayer } from "./VideoLinkPlayer";
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
  /** Opens a thread; with `pid`, at that floor (a floor link to another thread). */
  onOpenThread?: (tid: string, pid?: string) => void;
  onBack?: () => void;
  shortcutsOpen?: () => boolean;
  /** The floor a link opened in this thread, shown first. */
  focusPid?: string;
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
  // The thread's page on the forum, for the browser.
  const threadUrl = () => `${HOST}viewthread.php?tid=${props.post.id}`;

  let loadingMore = false;
  const loadingMoreShown = signal(false);

  function fetchPage(n: number) {
    loadReplyPage(props.post.id, n)
      .then(({ title: pageTitle, fid: pageFid, replies: list }) => {
        if (n === 1 && pageTitle) title.set(pageTitle);
        if (pageFid && !fid()) fid.set(pageFid);
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
    const body = [draftToPost(draft(), HOST), ...attachments().map(attachmentTag)].join("\n");
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
    // The thread's cached pages are stale now, so they are asked again.
    clearThreadReplyPages(props.post.id);
    replies.set([]);
    more.set(true);
    fetchPage(1);
  }

  // Pictures and files pasted or dropped into the reply: uploaded to the thread, sent as tags with the reply.
  const { attachments, uploading, onPaste, onFileDrop } = createAttachments(
    (file, kind) => {
      // While a reply is edited, its pictures go through the edit form's own upload box.
      const current = editing();
      return current ? uploadEditAttachment(current.form, file, kind) : uploadAttachment(fid(), props.post.id, file, kind);
    },
    (name) => `Couldn't upload ${name}. Try again.`,
    "Can't attach that file. Try dragging it into the box.",
  );

  function quote(r: Reply) {
    const text = replyQuoteInDraft(r, props.post.id);
    setDraft(draft() ? `${text}\n\n${draft()}` : `${text}\n`);
  }

  // Shows floor `pid` of this thread: when the list does not have it, its page replaces the
  // replies (the posts after it load from there), then the list scrolls to the floor.
  async function showFloor(pid: string) {
    if (!replies().some((r) => r.id === pid)) {
      try {
        const found = await loadFloorPage(props.post.id, pid);
        if (found.title) title.set(found.title);
        if (found.fid && !fid()) fid.set(found.fid);
        replies.set(found.replies);
        page.set(found.page);
        more.set(found.replies.length > 0);
      } catch (e) {
        notify("floor-error", "Couldn't open that post.");
        return;
      }
    }
    const index = replies().findIndex((r) => r.id === pid);
    if (index < 0) return;
    // The list lays out the replies it was given before it can scroll to one of them.
    setTimeout(() => repliesList?.scrollToIndex({ index, viewPosition: 0 }), 0);
  }

  // A link to a floor: in this thread the floor is shown here; in another, that thread opens at it.
  function openFloor(pid: string, tid: string) {
    if (tid === props.post.id) void showFloor(pid);
    else props.onOpenThread?.(tid, pid);
  }

  // The reply the box is editing: its loaded edit form and the text in the box. While it is set, the
  // box edits that reply instead of composing a new one; the reply draft is kept aside.
  const editing = signal<{ pid: string; seq: number; form: EditForm; text: string } | null>(null);
  // Only the signed-in user's own replies can be edited.
  const isOwn = (r: Reply) => !!props.signedIn && currentUser() === r.author.name;

  // The reply's own pictures, set aside while an edit is open; the edit has its own.
  let replyPictures: Attached[] = [];

  async function startEdit(r: Reply) {
    if (sending() || uploading() || editing()) return;
    try {
      const form = await loadEditForm(fid(), props.post.id, r.id, 1);
      replyPictures = attachments();
      attachments.set([]);
      // The box shows the quotes as `>` lines; saving turns them back into the forum's quotes.
      editing.set({ pid: r.id, seq: r.seq, form, text: postToDraft(form.message) });
      replyField?.focus();
    } catch (e) {
      notify("edit-error", e instanceof ReplyRefused ? e.message : "Couldn't open this reply for editing. Try again.");
    }
  }

  function endEdit() {
    editing.set(null);
    attachments.set(replyPictures);
    replyPictures = [];
  }

  // The reply waiting for its delete to be confirmed in the dialog, or null.
  const pendingDelete = signal<{ pid: string; seq: number } | null>(null);

  // Deletes the confirmed reply, then shows the thread as the forum now holds it.
  async function removeReply() {
    const target = pendingDelete();
    pendingDelete.set(null);
    if (!target || sending() || uploading()) return;
    sending.set(true);
    try {
      const form = await loadEditForm(fid(), props.post.id, target.pid, 1);
      await deletePost(fid(), props.post.id, target.pid, 1, form);
      notify("delete", "Reply deleted.");
    } catch (e) {
      notify("delete-error", e instanceof ReplyRefused ? e.message : "Couldn't delete this reply. Try again.");
    } finally {
      sending.set(false);
    }
    clearThreadReplyPages(props.post.id);
    replies.set([]);
    more.set(true);
    fetchPage(1);
  }

  function cancelEdit() {
    // A picture still uploading would land in the reply's list, so the edit waits for it.
    if (uploading()) return;
    endEdit();
  }

  async function saveEdit() {
    const current = editing();
    if (!current || !canSendReply(current.text) || sending() || uploading()) return;
    // The pictures go with the text as tags, as a reply's do.
    const body = [draftToPost(current.text, HOST), ...attachments().map(attachmentTag)].join("\n");
    sending.set(true);
    try {
      await editPost(fid(), props.post.id, current.pid, 1, current.form, body);
      notify("edit", "Reply edited.");
      endEdit();
    } catch (e) {
      // The forum's own refusal is shown as it words it; the box keeps the text for another try.
      notify("edit-error", e instanceof ReplyRefused ? e.message : "Couldn't save your edit. Try again.");
    } finally {
      sending.set(false);
    }
    // Reload the replies whether or not the save reported success, as after a reply: the cached
    // pages hold the old text, so they are dropped and the thread is asked again.
    clearThreadReplyPages(props.post.id);
    replies.set([]);
    more.set(true);
    fetchPage(1);
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
    enabled: () => keysOn() && !!props.signedIn && !editing() && replies().some((r) => r.seq === hovered()),
    run: () => {
      const target = replies().find((r) => r.seq === hovered());
      if (!target) return;
      quote(target);
      replyField?.focus();
    },
  });
  // `e` edits the highlighted reply, when it is the signed-in user's own (the same reply `q` quotes).
  useCommand("thread.edit", {
    enabled: () => {
      const target = replies().find((r) => r.seq === hovered());
      return keysOn() && !editing() && !!target && isOwn(target);
    },
    run: () => {
      const target = replies().find((r) => r.seq === hovered());
      if (target) void startEdit(target);
    },
  });

  // Load the first page and the saved draft once.
  if (props.focusPid) void showFloor(props.focusPid);
  else fetchPage(1);
  Storage.getItem(draftKey(props.post.id))
    .then((text) => draft.set(postToDraft(text ?? "")))
    .catch(() => undefined);

  return (
    <View style={{ flex: 1, alignSelf: "stretch" }}>
      {/* Under the title bar the title sits in the bar's caption area (the column extends up into it), centred
          on the bar's 44pt; it drags the window where nothing presses. With no bar, it keeps the top inset. */}
      <View
        desktop={{ windowDrag: true }}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, paddingTop: titleBarShown() ? 18 : 20 }}
      >
        {props.onBack ? (
          <View onPress={props.onBack} accessibilityLabel="Back" style={{ position: "absolute", left: 12, paddingVertical: 4, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 13, color: palette().muted }}>{"‹ Back"}</Text>
          </View>
        ) : null}
        {/* The icons sit at the left, bottom-aligned with the title: the favorite star, and the thread's
            browser icon, which opens the thread in the system browser. */}
        <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end", gap: 8, flexShrink: 0 }}>
          {props.signedIn ? (
            <View
              onPress={toggleFavorite}
              accessibilityLabel={saved() ? "Remove from favorites" : "Add to favorites"}
              tooltip={hint(saved() ? "取消收藏 (f)" : "收藏 (f)")}
            >
              {saved() ? <StarIcon size={16} filled={true} /> : <StarIcon size={16} />}
            </View>
          ) : null}
          <View
            onPress={() => void openLink(threadUrl())}
            accessibilityLabel="Open the thread in the browser"
            tooltip={hint("在浏览器中打开")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <BrowserIcon size={16} />
          </View>
        </View>
        {/* The title is centred in the space right of the icons; a long one is cut off at the icons' edge,
            and fades out over its first stretch there. */}
        <View style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <Text style={{ numberOfLines: 1, textAlign: "center", fontSize: 22, fontWeight: 600, color: palette().text }}>{title()}</Text>
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: 36,
              backgroundImage: `linear-gradient(to right, ${palette().bg}, transparent)`,
            }}
          />
        </View>
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {isOwn(item()) ? (
                    <View onPress={() => void startEdit(item())} accessibilityLabel="Edit" tooltip={hint("编辑")}>
                      <PencilIcon size={16} />
                    </View>
                  ) : null}
                  {/* The floor 1 is the thread itself, which is not deleted from here. */}
                  {isOwn(item()) && item().seq !== 1 ? (
                    <View onPress={() => pendingDelete.set({ pid: item().id, seq: item().seq })} accessibilityLabel="Delete" tooltip={hint("删除")}>
                      <TrashIcon size={16} />
                    </View>
                  ) : null}
                  <View onPress={() => quote(item())} accessibilityLabel="Quote" tooltip={hint("引用 (q)")}>
                    <BubbleIcon size={16} />
                  </View>
                </View>
              ) : null
            }
            body={
              <View style={{ gap: 12, alignSelf: "stretch" }}>
                <TextView
                  html={absolutize(trimLeadingBlanks(fixDiscuzMarkup(fixImages(item().body))), HOST)}
                  styles={item().seq === 1 ? OP_TITLE_STYLES : undefined}
                  extensions={DISCUZ_EXTENSIONS}
                  renderCustom={renderDiscuzNode}
                  onLinkPress={(e) => {
                    // A 4d4y thread link opens in this column; a file the post attaches is saved to Downloads;
                    // any other link opens in the system browser.
                    // A quote's arrow goes to its floor (see `openFloor`).
                    const floor = floorFromLink(e.url);
                    if (floor) {
                      openFloor(floor.pid, floor.ptid);
                      return;
                    }
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
                {videoLinksIn(item().body).map((url) => (
                  <VideoLinkPlayer url={url} />
                ))}
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
        <View style={{ alignSelf: "stretch" }}>
          {/* Shown while the box edits a reply: which floor, and that Send saves the edit. */}
          {editing() ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingTop: 12 }}>
              <Text style={{ fontSize: 12, color: palette().muted }}>{`正在编辑 #${editing()!.seq}`}</Text>
            </View>
          ) : null}
          {/* The box edits the reply under edit, and composes a new reply otherwise. */}
          <ReplyBox
            onFileDrop={onFileDrop}
            draft={() => editing()?.text ?? draft()}
            onDraft={(text) => {
              const current = editing();
              if (current) editing.set({ ...current, text });
              else setDraft(text);
            }}
            sending={() => sending()}
            uploading={() => uploading()}
            attachments={() => attachments()}
            canSend={() => canSendReply(editing()?.text ?? draft())}
            onSend={() => (editing() ? void saveEdit() : void send())}
            onPaste={onPaste}
            onCancel={cancelEdit}
            cancelShown={() => editing() !== null}
            fieldRef={(field) => {
              replyField = field;
            }}
          />
        </View>
      ) : null}
      {/* Deleting asks first. The button is red: the reply cannot be brought back. */}
      {pendingDelete() ? (
        // The popup fills the window and centres the card, which a dialog would otherwise leave at its top left.
        <Dialog
          animation="fade"
          onCancel={() => pendingDelete.set(null)}
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
          backdropStyle={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.3)" }}
        >
          <View style={{ width: 320, padding: 20, gap: 12, borderRadius: 12, backgroundColor: palette().bg }}>
            <Text style={{ fontSize: 15, fontWeight: 600, color: palette().text }}>{`删除 #${pendingDelete()!.seq} 这条回复？`}</Text>
            <Text style={{ fontSize: 13, color: palette().muted }}>删除后无法恢复。</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <View
                onPress={() => pendingDelete.set(null)}
                accessibilityLabel="Cancel"
                style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: palette().border }}
              >
                <Text style={{ fontSize: 13, color: palette().text }}>取消</Text>
              </View>
              <View
                onPress={() => void removeReply()}
                accessibilityLabel="Delete"
                style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, backgroundColor: palette().danger }}
              >
                <Text style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>删除</Text>
              </View>
            </View>
          </View>
        </Dialog>
      ) : null}
    </View>
  );
}
