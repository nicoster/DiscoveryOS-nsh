// The reply box under a thread's posts and under a private-message conversation: a
// multiline field with the send button at its right edge. Both screens share this one.
// Pasted pictures show as thumbnails above the text; they have no remove control, and
// they go with the reply. Cmd+Enter sends (Ctrl+Enter elsewhere); Enter adds a line.
import { Image, keymap, signal, Text, View, type PasteEvent } from "nsh";
import { Input } from "nsh/base";
import { palette } from "./appearance";
import { PlaneIcon, RefreshIcon } from "./icons";
import type { PixelSize } from "./pixelSize";

export type Attached = { id: string; kind: "image" | "file"; name: string; preview: string; size: PixelSize | null };

// A pasted picture at half its pixel size, keeping its shape. The longer side is capped so a
// very large picture still fits the box. A format whose size is unknown shows as a 64 pt square.
const SCALE = 0.5;
const MAX_SIDE = 400;
const SQUARE = 64;

function Thumb(props: { src: string; size: PixelSize | null }) {
  const box = props.size
    ? (() => {
        const scale = Math.min(SCALE, MAX_SIDE / Math.max(props.size.width, props.size.height));
        return { width: props.size.width * scale, height: props.size.height * scale };
      })()
    : { width: SQUARE, height: SQUARE };
  return <Image src={props.src} resizeMode="contain" style={{ width: box.width, height: box.height, borderRadius: 6 }} />;
}

// The text field grows with its text, up to MAX_FIELD: with the send row and the padding, the
// whole box is then 400 pt tall (without pictures). Past that the field scrolls.
const MIN_FIELD = 56;
const MAX_FIELD = 354;

export function ReplyBox(props: {
  draft: () => string;
  onDraft: (text: string) => void;
  sending: () => boolean;
  uploading?: () => boolean;
  attachments?: () => Attached[];
  /** Whether the reply may be sent now. By default, any text. */
  canSend?: () => boolean;
  onSend: () => void;
  onPaste?: (e: PasteEvent) => void;
  /** Local files dropped on the box, as `file:` URLs. */
  onFileDrop?: (uris: string[]) => void;
}) {
  const sendable = () => (props.canSend ? props.canSend() : props.draft().length > 0) && !props.sending() && !props.uploading?.();
  keymap.bind(
    "mod+enter",
    () => {
      if (sendable()) props.onSend();
    },
    { when: "always" },
  );
  const pictures = () => props.attachments?.() ?? [];
  const fieldHeight = signal(MIN_FIELD);
  // The text the platform inserted with a file's paste or drop: a file's name or path, not
  // something the user typed. It is taken back out of the draft when it arrives.
  let inserted: string | null = null;
  const pathOf = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));
  const takeBack = (text: string) => {
    const old = props.draft();
    const taken = inserted;
    inserted = null;
    props.onDraft(text);
    if (taken && text.length === old.length + taken.length && text.includes(taken)) {
      // The draft as it was before the file's name or path went in.
      setTimeout(() => props.onDraft(old), 0);
    }
  };

  return (
    <View
      onFileDrop={(e: { uris: string[] }) => {
        inserted = e.uris.map(pathOf).join("\n");
        props.onFileDrop?.(e.uris);
      }}
      style={{
        alignSelf: "stretch",
        margin: 12,
        padding: 8,
        gap: 4,
        borderRadius: 8,
        backgroundColor: palette().surface,
        // While a reply is being sent the whole box is dimmed, and its send icon turns.
        opacity: props.sending() ? 0.5 : 1,
      }}
    >
      {pictures().length > 0 ? (
        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 4 }}>
          {pictures().map((p) =>
            p.kind === "image" ? (
              <Thumb src={p.preview} size={p.size} />
            ) : (
              <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: palette().border }}>
                <Text style={{ fontSize: 13, color: palette().text }}>{p.name}</Text>
              </View>
            ),
          )}
        </View>
      ) : null}
      <Input
        placeholder="Reply"
        multiline={true}
        value={props.draft()}
        onChange={(text: string) => takeBack(text)}
        onPaste={(e: PasteEvent) => {
          if (e.files.length > 0 || e.uris.length > 0) inserted = e.text || null;
          props.onPaste?.(e);
        }}
        onContentSizeChange={(size: { height: number }) =>
          fieldHeight.set(Math.min(MAX_FIELD, Math.max(MIN_FIELD, Math.ceil(size.height) + 8)))
        }
        style={{ height: fieldHeight(), padding: 4, fontSize: 14, backgroundColor: "transparent" }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        {props.uploading?.() ? <Text style={{ fontSize: 12, color: palette().muted }}>Uploading…</Text> : null}
        <View onPress={sendable() ? props.onSend : undefined} accessibilityLabel="Send" style={{ padding: 4 }}>
          {props.sending() ? <RefreshIcon size={18} spinning={true} /> : <PlaneIcon size={18} enabled={() => sendable()} />}
        </View>
      </View>
    </View>
  );
}
