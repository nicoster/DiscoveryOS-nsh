// The text a link-preview card shows for the floor it points at. A floor already loaded in the
// open thread is shown at once (see `PostLinkCard`); the rest are fetched once per floor and kept
// here, so a link repeated in several posts costs one request. A floor that cannot be read still
// leaves a card the reader can press to open the floor. A card pointing into another thread also
// shows that thread's title: the same page already names it, so no extra request is needed.
import { signal, type Signal } from "nsh";
import { loadFloorPage } from "../discuz/forum";
import { bodyWithoutQuote, bodyWithoutReplyHeader, htmlToText, type Reply } from "../discuz/parse";
import type { PostLink } from "../discuz/postLinks";

/** A floor's author, number, date and plain text, as a card shows them. */
export type PostPreview = { name: string; seq: number; at?: string; text: string };
export type PreviewState = { status: "loading" | "ready" | "failed"; preview?: PostPreview };

/** A floor's text for a preview: no quote, no `回复 N#` header, no leading or trailing blanks. */
export function previewOf(reply: Reply): PostPreview {
  return {
    name: reply.author.name,
    seq: reply.seq,
    at: reply.at,
    text: htmlToText(bodyWithoutQuote(bodyWithoutReplyHeader(reply.body))),
  };
}

const states = new Map<string, Signal<PreviewState>>();
// Titles are shared by every card that links into the same thread: one floor's page names the
// title for all of them, including cards whose own floor is still loading or could not be read.
const titles = new Map<string, Signal<string | undefined>>();

function titleSignal(tid: string): Signal<string | undefined> {
  let title = titles.get(tid);
  if (!title) {
    title = signal<string | undefined>(undefined);
    titles.set(tid, title);
  }
  return title;
}

/** Reactive: the title of thread `tid`, once a floor of it has been fetched. */
export function threadTitle(tid: string): string | undefined {
  return titleSignal(tid)();
}

/**
 * Reads the state of `link`'s floor and starts its load on the first read. Read inside the JSX:
 * the card follows the signal when the page arrives. The state is shared by every card for the
 * same floor, including cards in other threads.
 */
export function previewState(link: PostLink): PreviewState {
  const key = `${link.ptid}:${link.pid}`;
  let state = states.get(key);
  if (!state) {
    state = signal<PreviewState>({ status: "loading" });
    states.set(key, state);
    const pending = state;
    void loadFloorPage(link.ptid, link.pid)
      .then(({ replies, title }) => {
        if (title) titleSignal(link.ptid).set(title);
        const reply = replies.find((r) => r.id === link.pid);
        pending.set(reply ? { status: "ready", preview: previewOf(reply) } : { status: "failed" });
      })
      .catch(() => pending.set({ status: "failed" }));
  }
  return state();
}
