// Writing a new thread in the channel open in the threads column. It takes the thread column (where a
// thread opens): a title, then the body in the reply box. The draft is saved per channel as it is typed,
// so closing the column keeps what was written, and a posted thread clears it.
import { signal, Storage, Text, View } from "nsh";
import { Input } from "nsh/base";
import { postThread, ReplyRefused, ThreadUnconfirmed, uploadAttachment } from "../discuz/client";
import { attachmentTag, createAttachments } from "./attachments";
import type { Post } from "../discuz/parse";
import { palette } from "./appearance";
import { ReplyBox } from "./ReplyBox";
import { canSendReply } from "./replyGate";
import { notify } from "./toast";
import { titleBarShown } from "./TitleBar";
import { titleBar } from "nsh/desktop";

const draftKey = (fid: string) => `newthread:${fid}`;

type Draft = { subject: string; body: string };

// A saved draft; anything unreadable is an empty one.
function readDraft(text: string | null): Draft {
  try {
    const d = JSON.parse(text ?? "") as Partial<Draft>;
    return { subject: typeof d.subject === "string" ? d.subject : "", body: typeof d.body === "string" ? d.body : "" };
  } catch {
    return { subject: "", body: "" };
  }
}

export function NewThread(props: {
  fid: string;
  /** The channel's name, shown above the title. */
  channel: string;
  /** Called with the new thread once the forum shows it; `undefined` when the forum confirmed the post without it. */
  onPosted: (thread: Post | undefined) => void;
  onClose: () => void;
}) {
  const subject = signal("");
  const body = signal("");
  const sending = signal(false);
  // Pictures and files pasted or dropped into the body: uploaded to the channel, sent as tags with the thread.
  const { attachments, uploading, onPaste, onFileDrop } = createAttachments(
    (file, kind) => uploadAttachment(props.fid, undefined, file, kind),
    (name) => `无法上传 ${name}，请重试。`,
    "无法添加这个文件，请拖进输入框试试。",
  );
  // The saved draft fills the fields once, unless the user has typed before it arrives.
  let typed = false;
  Storage.getItem(draftKey(props.fid))
    .then((text) => {
      if (typed) return;
      const d = readDraft(text);
      subject.set(d.subject);
      body.set(d.body);
    })
    .catch(() => undefined);

  function save() {
    typed = true;
    Storage.setItem(draftKey(props.fid), JSON.stringify({ subject: subject(), body: body() })).catch(() => undefined);
  }

  // A title, and a body that passes the reply's rule.
  const canSend = () => subject().trim().length > 0 && canSendReply(body());

  async function send() {
    if (sending() || uploading() || !canSend()) return;
    sending.set(true);
    const title = subject().trim();
    // The body's text, then the pictures and files as their tags.
    const text = [body(), ...attachments().map(attachmentTag)].join("\n");
    try {
      const tid = await postThread(props.fid, title, text);
      attachments.set([]);
      await Storage.setItem(draftKey(props.fid), "").catch(() => undefined);
      notify("new-thread", "新帖已发布。");
      props.onPosted(tid ? { id: tid, title, fid: props.fid } : undefined);
    } catch (e) {
      // Not cleared on failure: the draft stays, so nothing typed is lost.
      if (e instanceof ThreadUnconfirmed) {
        notify("new-thread-error", "无法确认新帖是否发出。请先到版块里查看，再决定是否重发。");
      } else {
        notify("new-thread-error", e instanceof ReplyRefused ? e.message : "发帖失败，请重试。");
      }
    } finally {
      sending.set(false);
    }
  }

  return (
    // The column reaches up under the title bar, so under the bar the form starts below its caption.
    <View style={{ flex: 1, alignSelf: "stretch", paddingTop: titleBarShown() ? titleBar().height + 12 : 12 }}>
      <Text style={{ fontSize: 15, color: palette().text, paddingHorizontal: 12, paddingBottom: 8 }}>{`在「${props.channel}」里写新帖子`}</Text>
      <Input
        placeholder="标题"
        value={subject()}
        onChange={({ value: text }: { value: string }) => {
          subject.set(text);
          save();
        }}
        style={{
          // The same side margins as the reply box below it; its bottom edge sits just above the box.
          marginHorizontal: 12,
          marginBottom: -4,
          fontSize: 15,
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: palette().border,
        }}
      />
      <ReplyBox
        placeholder="正文"
        draft={() => body()}
        onDraft={(text: string) => {
          body.set(text);
          save();
        }}
        sending={() => sending()}
        canSend={canSend}
        onSend={send}
        onCancel={props.onClose}
        attachments={() => attachments()}
        uploading={() => uploading()}
        onPaste={onPaste}
        onFileDrop={onFileDrop}
        // The body starts at 300 pt tall, grows to 600 pt, and does not fold to a chip.
        minField={300}
        maxField={600}
        collapsible={false}
      />
    </View>
  );
}
