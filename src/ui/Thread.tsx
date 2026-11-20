// A thread's replies, pages, quote and reply draft (`PostDetailView` of the
// Swift app). The draft is kept per thread in the app's storage.
import { cleanup, Clipboard, effect, keymap, List, signal, Storage, Text, untracked, View, type PasteEvent, type ListRef, type ViewRef } from "nsh";
import { Dialog, TextView } from "nsh/base";
import { currentUser, deletePost, editPost, HOST, loadEditForm, postReply, ReplyRefused, uploadAttachment, uploadEditAttachment, type EditForm } from "../discuz/client";
import { bookmarkPost, clearThreadReplyPages, loadFloorPage, loadReplyPage, removeBookmark } from "../discuz/forum";
import { absolutize, absoluteUrl, attachmentLinks, bodyWithoutQuote, fixDiscuzMarkup, fixImages, floorFromLink, htmlToText, isAttachmentUrl, linkBareUrls, markQuoteAttributions, mergePage, quotedFloor, repliedFloor, bodyWithoutReplyHeader, threadIdFromLink, trimLeadingBlanks, type Post, type Reply } from "../discuz/parse";
import { draftToPost, postToDraft, replyQuoteInDraft } from "../discuz/quote";
import { downloadAttachment } from "./downloads";
import { DISCUZ_EXTENSIONS, renderDiscuzNode } from "./discuzMarkup";
import { useCommand } from "./commands";
import { selectedText } from "./selection";
import { consoleDebug } from "../debugLog";
import { openLink } from "./links";
import { timeAgo } from "../discuz/timeAgo";
import { LoadingBar } from "./LoadingBar";
import { loadLastSeen, saveLastSeen } from "./lastSeen";
import { notify } from "./toast";

// Text without its whitespace, to find a selection in a reply's text whatever its line breaks.
const squash = (s: string) => s.replace(/\s+/g, "");
import { palette } from "./appearance";
import { captionInset, titleBarShown } from "./TitleBar";
import { BrowserIcon, LinkIcon, StarIcon } from "./icons";
import { MessageActions } from "./MessageActions";
import { EMOJI_REACTIONS_ON, pickerOpenOn, quickEmojis, reactionsOn, toggleReaction } from "./reactions";
import { ReplyCard, type ReplyComment } from "./ReplyCard";
import { ReplyBox } from "./ReplyBox";
import { createAttachments } from "./attachments";
import { withPictureTags, withoutPictureTag } from "./pictureTags";
import { clearSentReplyPictures, keepReplyPicture, removeReplyPicture, replyPictureList, replyRemovedIds } from "./replyPictures";
import { knownPictureSizes, pictureOptions } from "./pictureSizes";
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
  /** Opens a thread; with `pid`, at that floor (a floor link to another thread). `from` is the floor
   *  in this thread the link was pressed in, which Back returns to. */
  onOpenThread?: (tid: string, pid?: string, from?: string) => void;
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
  // The first page the list holds: pages before it load as the list scrolls up to its start.
  const firstPage = signal(1);
  const earlierShown = signal(false);
  // The floor the thread last opened at (the divider "上次看到这里" sits after it), or null.
  const dividerPid = signal<string | null>(null);
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

  // Counts the times the list is replaced from its first page or a floor's page: an earlier page
  // that arrives after that is for a list no longer shown, and is dropped.
  let listGeneration = 0;

  function fetchPage(n: number) {
    if (n === 1) listGeneration++;
    loadReplyPage(props.post.id, n)
      .then(({ title: pageTitle, fid: pageFid, replies: list }) => {
        if (n === 1 && pageTitle) title.set(pageTitle);
        if (pageFid && !fid()) fid.set(pageFid);
        const merged = n === 1 ? { items: list, more: list.length > 0 } : mergePage(replies(), list);
        replies.set(merged.items);
        more.set(merged.more);
        page.set(n);
        if (n === 1) firstPage.set(1);
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

  // Scrolled to the start of the list: the page before the first one shown is put above it, and the
  // row that was at the top of the viewport stays where it was (the list's own position, measured
  // before the page arrives, is put back on that row once the page is in).
  let loadingEarlier = false;
  function loadEarlier() {
    if (loadingEarlier || firstPage() <= 1) return;
    loadingEarlier = true;
    earlierShown.set(true);
    const n = firstPage() - 1;
    const generation = listGeneration;
    Promise.all([loadReplyPage(props.post.id, n), repliesList?.measureScrollPosition() ?? Promise.resolve(null)])
      .then(([{ replies: list }, at]) => {
        if (generation !== listGeneration) return;
        const have = new Set(replies().map((r) => r.id));
        const added = list.filter((r) => !have.has(r.id));
        replies.set([...added, ...replies()]);
        firstPage.set(n);
        // The row at the top moved down by the rows added above it: the viewport goes back to its offset in that row.
        const topPid = at ? replies()[at.index + added.length]?.id : undefined;
        if (at && topPid) {
          holdAt(topPid, -at.offset);
          setTimeout(() => repliesList?.scrollToIndex({ index: at.index + added.length, viewOffset: -at.offset, animated: false }), 0);
        }
      })
      .catch(() => notify("earlier-error", "无法加载更早的回复。"))
      .finally(() => {
        loadingEarlier = false;
        earlierShown.set(false);
      });
  }

  async function setDraft(text: string) {
    draft.set(text);
    // A draft that cannot be saved (storage full) is a convenience lost, not a failed action.
    await Storage.setItem(draftKey(props.post.id), text).catch(() => undefined);
  }

  async function send() {
    if (!canSendReply(draft()) || sending() || uploading()) return;
    // The reply's text, then the pictures as their tags. The pictures taken out since the last reply go with it.
    const sentPictures = replyPictureList();
    const removals = replyRemovedIds();
    const body = withPictureTags(draftToPost(draft(), HOST), sentPictures);
    sending.set(true);
    try {
      await postReply(fid(), props.post.id, body, removals);
      notify("reply", "回复已发布。");
      clearSentReplyPictures(
        sentPictures.map((p) => p.id),
        removals,
      );
      await setDraft("");
    } catch (e) {
      // The forum's own refusal (e.g. the 30-second limit) is shown as it words it.
      notify("reply-error", e instanceof ReplyRefused ? e.message : "回复发送失败，请重试。");
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
  // The reply's list is kept across threads (replyPictures.ts). An edit has its own list, from the edit form,
  // and its uploads go through the edit form's own upload box.
  const editPictures = signal<Attached[]>([]);
  // The pictures an edit takes out: their attachments are deleted with the save.
  let editRemovals: string[] = [];
  const replyAttach = createAttachments(
    replyPictureList,
    (file, kind) => uploadAttachment(fid(), props.post.id, file, kind),
    (name) => `无法上传 ${name}，请重试。`,
    "无法添加该文件，请尝试把它拖入输入框。",
    keepReplyPicture,
  );
  const editAttach = createAttachments(
    editPictures,
    (file, kind) => {
      const current = editing();
      if (!current) throw new Error("No reply is being edited");
      return uploadEditAttachment(current.form, file, kind);
    },
    (name) => `无法上传 ${name}，请重试。`,
    "无法添加该文件，请尝试把它拖入输入框。",
  );
  // The box's uploads, paste and pictures are those of the edit while one is open, else of the reply.
  const uploading = () => replyAttach.uploading() || editAttach.uploading();
  const onPaste = (e: PasteEvent) => (editing() ? editAttach : replyAttach).onPaste(e);
  const onFileDrop = (uris: string[]) => (editing() ? editAttach : replyAttach).onFileDrop(uris);
  const pictures = () => (editing() ? editPictures() : replyPictureList());

  // Takes a picture out of the box: it leaves the list, its tag leaves the text, and an image's attachment
  // is deleted on the forum when the reply (or the edit) is sent.
  function removePicture(picture: Attached) {
    const current = editing();
    if (current) {
      editPictures.set(editPictures().filter((p) => p.id !== picture.id));
      if (picture.kind === "image") editRemovals = [...editRemovals, picture.id];
      editing.set({ ...current, text: withoutPictureTag(current.text, picture.id) });
    } else {
      removeReplyPicture(picture);
      setDraft(withoutPictureTag(draft(), picture.id));
    }
  }

  function quote(r: Reply, selected?: string) {
    const text = replyQuoteInDraft(r, props.post.id, selected);
    setDraft(draft() ? `${text}\n\n${draft()}` : `${text}\n`);
  }

  // The reply that is flashing after a jump, the timer that clears it, and the post cards by reply id
  // (to tell whether a jump needs to scroll). Declared before the list is built, which reads the cards.
  const flashedPid = signal<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  const cardRefs = new Map<string, ViewRef>();

  // The loaded replies that quote each floor, by the quoted floor's id. Rebuilt whenever the loaded
  // list changes (a page that loads later can hold the quoting reply), and read reactively by each row,
  // so a floor shown earlier gets its comments when the quoting reply arrives.
  let commentsSource: Reply[] | undefined;
  let commentsByFloor = new Map<string, ReplyComment[]>();
  function commentsOn(pid: string): ReplyComment[] {
    const list = replies();
    if (list !== commentsSource) {
      const next = new Map<string, ReplyComment[]>();
      for (const r of list) {
        // A reply counts as a comment of the floor it quotes, or of the floor its `回复 N#` header names.
        const target = quotedFloor(r.body, props.post.id) ?? repliedFloor(r.body, props.post.id);
        if (!target || target === r.id) continue;
        const text = htmlToText(bodyWithoutQuote(bodyWithoutReplyHeader(r.body)));
        // A reply that only quotes says nothing of its own, so it has no comment.
        if (text === "") continue;
        const bucket = next.get(target) ?? [];
        bucket.push({ id: r.id, name: r.author.name, seq: r.seq, text });
        next.set(target, bucket);
      }
      commentsByFloor = next;
      commentsSource = list;
    }
    return commentsByFloor.get(pid) ?? [];
  }

  // Shows floor `pid` of this thread: when the list does not have it, its page replaces the
  // replies (the posts after it load from there), then the list scrolls to the floor.
  // `quiet` is the thread reopening at its last-read floor: no message if it fails, and no flash.
  // Returns whether the floor is shown.
  // `dividerBelow`: the floor's divider (it sits under the floor's card) is put at 300pt, not the card.
  async function showFloor(pid: string, quiet = false, dividerBelow = false): Promise<boolean> {
    if (!replies().some((r) => r.id === pid)) {
      listGeneration++;
      try {
        const found = await loadFloorPage(props.post.id, pid);
        if (found.title) title.set(found.title);
        if (found.fid && !fid()) fid.set(found.fid);
        replies.set(found.replies);
        page.set(found.page);
        firstPage.set(found.page);
        more.set(found.replies.length > 0);
      } catch (e) {
        if (!quiet) notify("floor-error", "无法打开该帖子。");
        return false;
      }
    }
    // A jump is not reading: the floors it passes are not recorded as seen (see `trackSeen`).
    jumping = true;
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => (jumping = false), 1000);
    // A floor already on screen stays where it is; otherwise it is scrolled to 300pt below the top of the list.
    const listBox = await repliesList?.measure();
    const cardBox = await cardRefs.get(pid)?.measure();
    // The divider starts where the card ends, so the floor's top sits above 300pt by the card's height.
    const cardHeight = dividerBelow ? cardBox?.bounds.size.height ?? 0 : 0;
    const index = replies().findIndex((r) => r.id === pid);
    if (index < 0) return false;
    const onScreen =
      !!listBox &&
      !!cardBox &&
      cardBox.pagePosition.y >= listBox.pagePosition.y &&
      cardBox.pagePosition.y + cardBox.bounds.size.height <= listBox.pagePosition.y + listBox.bounds.size.height;
    // The list lays out the replies it was given before it can scroll to one of them.
    if (!onScreen) {
      holdAt(pid, 300 - cardHeight);
      setTimeout(() => repliesList?.scrollToIndex({ index, viewPosition: 0, viewOffset: 300 - cardHeight }), 0);
    }
    // The post jumped to shows in yellow for a second, then returns to its own colour.
    if (!quiet) {
      flashedPid.set(pid);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => flashedPid.set(null), 1000);
    }
    return true;
  }

  // The floors on screen are read: the furthest one read is kept, and saved for the thread to open at
  // next time. A save waits a second, so scrolling writes once; it is also written when the thread closes.
  let seenPlace: { pid: string; seq: number } | null = null;
  let seenTid = "";
  let seenSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let jumping = false;
  let jumpTimer: ReturnType<typeof setTimeout> | undefined;

  function flushSeen() {
    clearTimeout(seenSaveTimer);
    seenSaveTimer = undefined;
    if (seenPlace) void saveLastSeen(seenTid, seenPlace);
  }
  cleanup(flushSeen);

  // The floor the view is held on: the view is kept with it at its offset from the top of the list until
  // the user scrolls (a touch, a drag or the wheel releases it). While it is held, any other scroll is put
  // back, and so is any content above the floor changing its height (pictures, quoted comments).
  let hold: { pid: string; offset: number } | null = null;

  function releaseHold() {
    hold = null;
  }

  function holdAt(pid: string, offset: number) {
    hold = { pid, offset };
  }

  // Scrolls back to the held floor. Its own scroll is not reading, so it is not recorded as seen.
  function reholdAt() {
    if (!hold) return;
    const index = replies().findIndex((r) => r.id === hold!.pid);
    if (index < 0) return;
    jumping = true;
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => (jumping = false), 1000);
    const { offset } = hold;
    setTimeout(() => repliesList?.scrollToIndex({ index, viewPosition: 0, viewOffset: offset }), 0);
  }

  // A scroll that moved the held floor off its offset (more than a couple of points), or left it off the
  // rendered rows, is put back on it.
  async function correctHold() {
    const held = hold;
    if (!held || jumping) return;
    const listBox = await repliesList?.measure();
    const cardBox = await cardRefs.get(held.pid)?.measure();
    if (hold !== held) return;
    if (listBox && cardBox) {
      const drift = cardBox.pagePosition.y - listBox.pagePosition.y - held.offset;
      if (Math.abs(drift) <= 2) return;
    }
    reholdAt();
  }

  // Content above the held floor changing its height puts the view back on the held floor: a picture's
  // size arriving, and replies arriving (their quoted comments are drawn under the posts they quote, which
  // can be above the held floor).
  effect(() => {
    knownPictureSizes();
    replies();
    untracked(reholdAt);
  });

  // Called as the list's visible floors change. A floor is read only when all of it is on screen, so the
  // furthest such floor further down than any read so far becomes the new place. Candidates are checked
  // from the furthest down, and the first fully on screen wins.
  async function trackSeen(visible: { index?: number | null }[]) {
    if (jumping) return;
    const floor = seenPlace?.seq ?? 0;
    const candidates = visible
      .map((v) => (v.index == null ? undefined : replies()[v.index]))
      .filter((r): r is Reply => !!r && r.seq > floor)
      .sort((a, b) => b.seq - a.seq);
    if (candidates.length === 0) return;
    const listBox = await repliesList?.measure();
    if (!listBox || jumping) return;
    for (const r of candidates) {
      const box = await cardRefs.get(r.id)?.measure();
      if (!box) continue;
      const fullyShown =
        box.pagePosition.y >= listBox.pagePosition.y &&
        box.pagePosition.y + box.bounds.size.height <= listBox.pagePosition.y + listBox.bounds.size.height;
      if (!fullyShown) continue;
      if (seenPlace && seenPlace.seq >= r.seq) return;
      seenPlace = { pid: r.id, seq: r.seq };
      seenTid = props.post.id;
      clearTimeout(seenSaveTimer);
      seenSaveTimer = setTimeout(flushSeen, 1000);
      return;
    }
  }

  // A link to a floor: in this thread the floor is shown here; in another, that thread opens at it.
  // `from` is the floor the link was pressed in, so Back can return to it.
  function openFloor(pid: string, tid: string, from?: string) {
    if (tid === props.post.id) void showFloor(pid);
    else props.onOpenThread?.(tid, pid, from);
  }

  // The reply the box is editing: its loaded edit form and the text in the box. While it is set, the
  // box edits that reply instead of composing a new one; the reply draft is kept aside.
  const editing = signal<{ pid: string; seq: number; form: EditForm; text: string } | null>(null);
  // Only the signed-in user's own replies can be edited.
  const isOwn = (r: Reply) => !!props.signedIn && currentUser() === r.author.name;

  async function startEdit(r: Reply) {
    if (sending() || uploading() || editing()) return;
    try {
      const form = await loadEditForm(fid(), props.post.id, r.id, 1);
      // The reply's pictures are kept as they are; the edit starts with the pictures the post carries on the forum.
      editPictures.set(form.images.map((i): Attached => ({ id: i.id, kind: "image", name: i.name, preview: i.src, size: null })));
      editRemovals = [];
      // The box shows the quotes as `>` lines; saving turns them back into the forum's quotes.
      editing.set({ pid: r.id, seq: r.seq, form, text: postToDraft(form.message) });
      replyField?.focus();
    } catch (e) {
      notify("edit-error", e instanceof ReplyRefused ? e.message : "无法打开这条回复进行编辑，请重试。");
    }
  }

  function endEdit() {
    editing.set(null);
    editPictures.set([]);
    editRemovals = [];
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
      notify("delete", "回复已删除。");
    } catch (e) {
      notify("delete-error", e instanceof ReplyRefused ? e.message : "无法删除这条回复，请重试。");
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
    // The pictures added in this edit go with the text as tags, as a reply's do; the post's own pictures are in its text already.
    const added = editPictures().filter((p) => !current.form.images.some((i) => i.id === p.id));
    const body = withPictureTags(draftToPost(current.text, HOST), added);
    sending.set(true);
    try {
      await editPost(fid(), props.post.id, current.pid, 1, current.form, body, editRemovals);
      notify("edit", "回复已修改。");
      endEdit();
    } catch (e) {
      // The forum's own refusal is shown as it words it; the box keeps the text for another try.
      notify("edit-error", e instanceof ReplyRefused ? e.message : "无法保存修改，请重试。");
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
          notify("favorite", "已取消收藏。");
          props.onUnfavorited?.();
        } else {
          notify("favorite-error", "无法取消收藏，请重试。");
        }
      } else if (await bookmarkPost(props.post.id)) {
        markFavorite(props.post.id, true, props.post.lastReplyAt ?? props.post.at);
        notify("favorite", "已收藏。");
      }
    } catch (e) {
      notify("favorite-error", "无法更新收藏，请重试。");
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
  let replyField: { focus(): void; blur(): void } | undefined;
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
      // Text selected in the highlighted reply is all that is quoted; otherwise the whole reply. The
      // selection comes from the app's outer selectable view (see `selection.ts`): a reply's own text
      // view is empty while it sits inside that view.
      const picked = selectedText().trim();
      const inReply = picked !== "" && squash(htmlToText(target.body)).includes(squash(picked));
      consoleDebug(`quote: q ${JSON.stringify({ floor: target.seq, selected: picked.length, inReply })}`);
      quote(target, inReply ? picked : undefined);
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

  // `1` to `4` react to the highlighted reply with the quick emoji in that place of the bar, as a click does.
  // They work with no sign-in, since reactions are kept on this machine.
  const reactWithQuick = (n: number) => {
    const target = replies().find((r) => r.seq === hovered());
    const emoji = quickEmojis()[n - 1];
    if (target && emoji) toggleReaction(target.id, emoji);
  };
  const reactEnabled = (n: number) => () => keysOn() && !editing() && replies().some((r) => r.seq === hovered()) && !!quickEmojis()[n - 1];
  // Registered only while reactions are on: an unregistered command is left out of the shortcut list.
  if (EMOJI_REACTIONS_ON) {
    useCommand("thread.react1", { enabled: reactEnabled(1), run: () => reactWithQuick(1) });
    useCommand("thread.react2", { enabled: reactEnabled(2), run: () => reactWithQuick(2) });
    useCommand("thread.react3", { enabled: reactEnabled(3), run: () => reactWithQuick(3) });
    useCommand("thread.react4", { enabled: reactEnabled(4), run: () => reactWithQuick(4) });
  }

  // Opens the thread at the floor last read to, with the divider after it. With none saved (or it is
  // the first floor, or it cannot be loaded), the thread opens at its first page.
  async function reopenAtSeen() {
    const saved = await loadLastSeen(props.post.id).catch(() => null);
    if (!saved || saved.seq <= 1) return fetchPage(1);
    if (!(await showFloor(saved.pid, true, true))) return fetchPage(1);
    seenPlace = { pid: saved.pid, seq: saved.seq };
    seenTid = props.post.id;
    dividerPid.set(saved.pid);
  }

  // Load the first page and the saved draft once.
  if (props.focusPid) void showFloor(props.focusPid);
  else void reopenAtSeen();
  Storage.getItem(draftKey(props.post.id))
    .then((text) => draft.set(postToDraft(text ?? "")))
    .catch(() => undefined);

  return (
    <View style={{ flex: 1, alignSelf: "stretch" }}>
      {/* Under the title bar the title sits in the bar's caption area (the column extends up into it), centred
          on the bar's 44pt; it drags the window where nothing presses. With no bar, it keeps the top inset. */}
      <View
        desktop={{ windowDrag: true }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 12,
          paddingTop: titleBarShown() ? 18 : 20,
          // The window's own buttons sit at the top right of the bar: the title keeps clear of them.
          paddingRight: 12 + captionInset(),
        }}
      >
        {/* Back sits in the row, first, so the icons after it move right with it. */}
        {props.onBack ? (
          <View onPress={props.onBack} accessibilityLabel="返回" style={{ paddingVertical: 4, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 13, color: palette().muted }}>{"‹ 返回"}</Text>
          </View>
        ) : null}
        {/* The icons sit at the left, bottom-aligned with the title: the favorite star, and the thread's
            browser icon, which opens the thread in the system browser. */}
        <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end", gap: 8, flexShrink: 0 }}>
          {props.signedIn ? (
            <View
              onPress={toggleFavorite}
              accessibilityLabel={saved() ? "取消收藏" : "收藏"}
              tooltip={hint(saved() ? "取消收藏 (f)" : "收藏 (f)")}
            >
              {saved() ? <StarIcon size={16} filled={true} /> : <StarIcon size={16} />}
            </View>
          ) : null}
          <View
            onPress={() => void openLink(threadUrl())}
            accessibilityLabel="在浏览器中打开帖子"
            tooltip={hint("在浏览器中打开")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <BrowserIcon size={16} />
          </View>
          <View
            onPress={() => {
              Clipboard.writeText(threadUrl());
              notify("copy-link", "链接已复制。");
            }}
            accessibilityLabel="复制帖子链接"
            tooltip={hint("复制帖子链接")}
          >
            <LinkIcon size={16} />
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
          <Text style={{ fontSize: 13, color: palette().muted }}>无法加载回复。</Text>
          <View
            onPress={() => fetchPage(failedPage()!)}
            accessibilityLabel="刷新"
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: palette().border }}
          >
            <Text style={{ fontSize: 13, color: palette().text }}>刷新</Text>
          </View>
        </View>
      ) : null}
      {/* A virtualized list: only the replies near the viewport exist, and their views are
          reused as the user scrolls. Each row reads its reply through `item()`. */}
      <List
        style={{ flex: 1 }}
        // A press anywhere in the posts takes the focus out of the reply box, as Esc does, so the
        // shortcuts (q, e) act on the post under the pointer. The capture runs before the post's own press.
        onTouchStartCapture={() => {
          replyField?.blur();
          releaseHold();
        }}
        onScrollDragStart={() => releaseHold()}
        onScroll={() => void correctHold()}
        onWheel={() => releaseHold()}
        contentStyle={{ padding: 12, gap: 12 }}
        each={replies()}
        estimatedItemSize={180}
        onLoadMore={loadMore}
        onLoadMoreAtStart={loadEarlier}
        onViewableItemsChange={(e) => void trackSeen(e.viewableItems)}
        header={() => <View>{earlierShown() ? <LoadingBar /> : null}</View>}
        footer={() => <View>{loadingMoreShown() ? <LoadingBar /> : null}</View>}
        ref={(n: ListRef | null) => {
          repliesList = n ?? undefined;
        }}
      >
        {(item) => (
          <View>
            <ReplyCard
              id={item().id}
              avatar={item().author.avatar ? absoluteUrl(item().author.avatar!, HOST) : undefined}
              name={item().author.name}
              isOp={opId() !== undefined && item().author.id === opId()}
              meta={`#${item().seq} · ${timeAgo(item().at)}`}
              comments={() => commentsOn(item().id)}
              onCommentPress={(pid) => openFloor(pid, props.post.id, item().id)}
              highlighted={() => hovered() === item().seq}
              flashed={() => flashedPid() === item().id}
              cardRef={(n) => {
                // A row is reused for other replies, so an empty ref only forgets this reply's card.
                if (n) cardRefs.set(item().id, n);
                else cardRefs.delete(item().id);
              }}
              onHoverIn={() => hovered.set(item().seq)}
              onHoverOut={() => {
                // The pointer goes to the picker, which is outside the post: the post stays highlighted while it is open.
                if (hovered() === item().seq && pickerOpenOn() === null) hovered.set(null);
              }}
              // Hovering a post shows its bar: the quick emojis, and quote, edit and delete. Edit and
              // delete are the signed-in user's own posts only, and floor 1 is not deleted from here.
              actionBar={
                EMOJI_REACTIONS_ON || props.signedIn ? (
                  <MessageActions
                    pid={item().id}
                    quick={quickEmojis}
                    onClose={() => {
                      if (hovered() === item().seq) hovered.set(null);
                    }}
                    mine={() => reactionsOn(item().id)}
                    onReact={(emoji) => toggleReaction(item().id, emoji)}
                    onQuote={props.signedIn ? () => quote(item()) : undefined}
                    onEdit={props.signedIn && isOwn(item()) ? () => void startEdit(item()) : undefined}
                    onDelete={props.signedIn && isOwn(item()) && item().seq !== 1 ? () => pendingDelete.set({ pid: item().id, seq: item().seq }) : undefined}
                  />
                ) : null
              }
              reactions={EMOJI_REACTIONS_ON ? () => reactionsOn(item().id) : undefined}
              onReactionPress={(emoji) => toggleReaction(item().id, emoji)}
              body={
                <View style={{ gap: 12, alignSelf: "stretch" }}>
                  <TextView
                    html={absolutize(markQuoteAttributions(trimLeadingBlanks(linkBareUrls(fixDiscuzMarkup(fixImages(item().body, pictureOptions(item().body, HOST))))), props.post.id), HOST)}
                    styles={item().seq === 1 ? OP_TITLE_STYLES : undefined}
                    extensions={DISCUZ_EXTENSIONS}
                    selectable
                    renderCustom={(node) =>
                      renderDiscuzNode(
                        node,
                        (pid) => openFloor(pid, props.post.id, item().id),
                        (pid) => replies().find((r) => r.id === pid)?.seq,
                      )
                    }
                    onLinkPress={(e) => {
                      // A 4d4y thread link opens in this column; a file the post attaches is saved to Downloads;
                      // any other link opens in the system browser.
                      // A quote's arrow goes to its floor (see `openFloor`).
                      consoleDebug(`link: press ${JSON.stringify({ url: e.url, seq: item().seq })}`);
                      const floor = floorFromLink(e.url);
                      if (floor) {
                        openFloor(floor.pid, floor.ptid, item().id);
                        return;
                      }
                      const tid = threadIdFromLink(e.url);
                      if (tid && props.onOpenThread) {
                        props.onOpenThread(tid, undefined, item().id);
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
            {/* The divider after the floor last read to. Not shown when that floor is the newest, with no more pages. */}
            {dividerPid() === item().id && (more() || replies()[replies().length - 1]?.id !== item().id) ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: palette().divider }} />
                <Text style={{ fontSize: 12, color: palette().dividerText }}>上次看到这里</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: palette().divider }} />
              </View>
            ) : null}
          </View>
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
            attachments={pictures}
            onRemove={removePicture}
            canSend={() => canSendReply(editing()?.text ?? draft())}
            onSend={() => (editing() ? void saveEdit() : void send())}
            onPaste={onPaste}
            onCancel={cancelEdit}
            cancelShown={() => editing() !== null}
            pasteHint={true}
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
                accessibilityLabel="取消"
                style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: palette().border }}
              >
                <Text style={{ fontSize: 13, color: palette().text }}>取消</Text>
              </View>
              <View
                onPress={() => void removeReply()}
                accessibilityLabel="删除"
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
