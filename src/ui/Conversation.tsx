// The private messages with one correspondent, shown in the open-thread column in the same
// post style as a thread: one card per message, the time in its meta line, and the thread's
// reply box under them.
import { effect, List, signal, Storage, Text, untracked, View } from "nsh";
import { TextView } from "nsh/base";
import { loadPmConversation, sendPm } from "../discuz/forum";
import { absolutize, absoluteUrl, fixImages, threadIdFromLink, trimLeadingBlanks, type PmMessage, type Post } from "../discuz/parse";
import { HOST } from "../discuz/client";
import { palette } from "./appearance";
import { notify } from "./toast";
import { openLink } from "./links";
import { ReplyBox } from "./ReplyBox";
import { ReplyCard } from "./ReplyCard";

const draftKey = (uid: string) => `pm-draft:${uid}`;

// `onOpenThread` takes a press on a link to a 4d4y thread, which the thread column then shows.
export function Conversation(props: { peer: () => Post; onOpenThread?: (tid: string) => void }) {
  const messages = signal<PmMessage[] | null>(null);
  const draft = signal("");
  const sending = signal(false);
  // Each load gets a number; a reply to an earlier load is dropped when a newer one started.
  let latest = 0;

  function load(uid: string) {
    const token = ++latest;
    messages.set(null);
    loadPmConversation(uid)
      .then((list) => {
        if (token === latest) messages.set(list);
      })
      .catch((e) => {
        if (token === latest) notify("pm-load", "Couldn't load messages. Tap to retry.", () => load(uid));
      });
    // The draft saved for this correspondent comes back with the conversation.
    Storage.getItem(draftKey(uid))
      .then((text) => {
        if (token === latest) draft.set(text ?? "");
      })
      .catch(() => undefined);
  }

  async function setDraft(text: string) {
    draft.set(text);
    // A draft that cannot be saved (storage full) is a convenience lost, not a failed action.
    await Storage.setItem(draftKey(props.peer().id), text).catch(() => undefined);
  }

  async function send() {
    const uid = props.peer().id;
    const list = messages() ?? [];
    const lastDay = list.length > 0 ? list[list.length - 1].at.split(" ")[0] : "";
    sending.set(true);
    try {
      const fresh = await sendPm(uid, lastDay, draft());
      if (uid === props.peer().id) messages.set(fresh);
      await setDraft("");
    } catch (e) {
      notify("pm-send", `Couldn't send your message. ${e instanceof Error ? e.message : ""}`.trim());
    } finally {
      sending.set(false);
    }
  }

  // Opening another correspondent loads its messages; the list is replaced, not merged.
  effect(() => {
    const uid = props.peer().id;
    untracked(() => load(uid));
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: 600, color: palette().text }}>{`和 ${props.peer().title} 的对话`}</Text>
      </View>
      {messages() === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 13, color: palette().muted }}>Loading…</Text>
        </View>
      ) : null}
      {messages() !== null && messages()!.length === 0 ? (
        <Text style={{ fontSize: 13, color: palette().muted, textAlign: "center", padding: 16 }}>No messages.</Text>
      ) : null}
      {messages() !== null && messages()!.length > 0 ? (
        <List
          style={{ flex: 1 }}
          contentStyle={{ padding: 12, gap: 12 }}
          each={messages()!}
          estimatedItemSize={180}
        >
          {(item) => (
            <ReplyCard
              avatar={item().avatar ? absoluteUrl(item().avatar!, HOST) : undefined}
              name={item().author}
              meta={item().at}
              body={
                <TextView
                  html={absolutize(trimLeadingBlanks(fixImages(item().body)), HOST)}
                  onLinkPress={(e) => {
                    const tid = threadIdFromLink(e.url);
                    if (tid && props.onOpenThread) props.onOpenThread(tid);
                    else void openLink(e.url);
                  }}
                />
              }
            />
          )}
        </List>
      ) : null}
      <ReplyBox draft={() => draft()} onDraft={(text) => setDraft(text)} sending={() => sending()} onSend={send} />
    </View>
  );
}
