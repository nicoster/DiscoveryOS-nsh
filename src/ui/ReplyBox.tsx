// The reply box under a thread's posts and under a private-message conversation: a
// multiline field with the send button at its bottom-right corner, in the same row. The field
// is one line until it has the focus or has text. Both screens share this one.
// Pasted pictures show as thumbnails above the text; they have no remove control, and
// they go with the reply. Cmd+Enter sends (Ctrl+Enter elsewhere); Enter adds a line.
import { effect, Image, keymap, LayoutAnimation, reduceMotion, signal, Text, untracked, View, type PasteEvent } from "nsh";
import { Input } from "nsh/base";
import { palette } from "./appearance";
import { PlaneIcon, RefreshIcon } from "./icons";
import type { PixelSize } from "./pixelSize";

export type Attached = { id: string; kind: "image" | "file"; name: string; preview: string; size: PixelSize | null };

// A pasted picture at half its pixel size, keeping its shape, and no taller than 300 pt: a taller
// one is scaled down proportionally to 300 pt. A format whose size is unknown shows as a 128 pt square.
const SCALE = 0.5;
const MAX_HEIGHT = 300;
const SQUARE = 128;

function Thumb(props: { src: string; size: PixelSize | null }) {
  const box = props.size
    ? (() => {
        const height = Math.min(props.size.height * SCALE, MAX_HEIGHT);
        return { width: (props.size.width * height) / props.size.height, height };
      })()
    : { width: SQUARE, height: SQUARE };
  // The box fixes the size; the picture fills it, so its own pixel size never takes over the layout.
  return (
    <View style={{ width: box.width, height: box.height, borderRadius: 6, overflow: "hidden" }}>
      <Image src={props.src} resizeMode="contain" style={{ width: box.width, height: box.height }} />
    </View>
  );
}

// The text field grows with its text, up to MAX_FIELD: with the send row and the padding, the
// whole box is then 400 pt tall (without pictures). Past that the field scrolls.
const MIN_FIELD = 56;
const MAX_FIELD = 354;
// The field's height with one line of 14 pt text and its padding; the text is centred in it.
const ONE_LINE = 34;
// The collapsed box is a chip: its corners are semicircles, a radius of half its height (one line
// of the field plus the box's 8 pt padding on each side, 50 pt).
const CHIP_RADIUS = 25;

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
  // The field is one line until it has the focus or has text; the send button stays in the
  // same row at the box's bottom-right corner in both states.
  const focused = signal(false);
  // A picture or an upload is content too, so the box stays open with them.
  const collapsed = () => !focused() && props.draft().length === 0 && pictures().length === 0 && !props.uploading?.();
  // The field's ref: it takes the focus back out when a reply is posted (the draft is cleared then;
  // a failed send keeps the draft and the focus).
  let field: { blur(): void } | undefined;
  let wasSending = false;
  effect(() => {
    const now = props.sending();
    untracked(() => {
      if (wasSending && !now && props.draft().length === 0) field?.blur();
      wasSending = now;
    });
  });
  // Switching between the chip and the field animates the layout change (240 ms, as the channel
  // column's glide); the change of the corner radius is not part of it, so it snaps.
  let lastCollapsed: boolean | null = null;
  effect(() => {
    const now = collapsed();
    untracked(() => {
      if (lastCollapsed !== null && now !== lastCollapsed && !reduceMotion()) {
        const curve = { type: "easeInEaseOut" as const };
        LayoutAnimation.configureNext({
          duration: 240,
          update: curve,
          create: { ...curve, property: "opacity" },
          delete: { ...curve, property: "opacity" },
        });
      }
      lastCollapsed = now;
    });
  });
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
        borderRadius: collapsed() ? CHIP_RADIUS : 8,
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
      {/* Collapsed, the field and the send button share the chip's centre line; expanded, the button sits at the bottom. */}
      <View style={{ flexDirection: "row", alignItems: collapsed() ? "center" : "flex-end", gap: 8 }}>
        <Input
          ref={(n) => {
            field = n as unknown as { blur(): void };
          }}
          placeholder="Reply"
          multiline={true}
          value={props.draft()}
          onChange={(text: string) => takeBack(text)}
          onPaste={(e: PasteEvent) => {
            if (e.files.length > 0 || e.uris.length > 0) inserted = e.text || null;
            props.onPaste?.(e);
          }}
          onFocus={() => focused.set(true)}
          onBlur={() => focused.set(false)}
          onContentSizeChange={(size: { height: number }) =>
            fieldHeight.set(Math.min(MAX_FIELD, Math.max(MIN_FIELD, Math.ceil(size.height) + 8)))
          }
          style={{
            flex: 1,
            height: collapsed() ? ONE_LINE : fieldHeight(),
            padding: 4,
            // The placeholder sits 3 pt further in, away from the chip's round end.
            paddingLeft: 7,
            // One line: the padding centres the 17 pt line in the field's height.
            paddingVertical: collapsed() ? (ONE_LINE - 17) / 2 : 4,
            fontSize: 14,
            backgroundColor: "transparent",
          }}
        />
        {props.uploading?.() ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 8 }}>
            <Text style={{ fontSize: 12, color: palette().muted }}>Uploading…</Text>
            <RefreshIcon size={12} spinning={true} />
          </View>
        ) : null}
        {pictures().length > 0 && !props.uploading?.() ? (
          <Text style={{ fontSize: 12, color: palette().muted, paddingBottom: 8 }}>
            {`Uploaded ${pictures().length} ${pictures().length === 1 ? "file" : "files"}`}
          </Text>
        ) : null}
        <View onPress={sendable() ? props.onSend : undefined} accessibilityLabel="Send" style={{ padding: 4, paddingRight: 7 }}>
          {props.sending() ? <RefreshIcon size={18} spinning={true} /> : <PlaneIcon size={18} enabled={() => sendable()} />}
        </View>
      </View>
    </View>
  );
}
