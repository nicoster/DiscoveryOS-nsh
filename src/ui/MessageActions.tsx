// The bar that hovers over a post: the quick emojis, a button for more, the post's link, and the
// post's actions (quote, edit, delete). The copy-link button is always there; each other action
// is shown only when the caller passes it. The emoji picker opens as an overlay on the app's root
// view, so the posts below it (and their native text views) cannot cover it.
import { Overlay, signal, Text, View, type ViewRef } from "nsh";
import { palette } from "./appearance";
import { PencilIcon, QuoteIcon, LinkIcon, SmileIcon, TrashIcon } from "./icons";
import { hint } from "./Hint";
import { EMOJI_REACTIONS_ON, pickerOpenOn } from "./reactions";

/** The emojis the "more" picker offers, beyond the quick bar. */
export const EMOJI_CHOICES = [
  "😀", "😂", "🥰", "😮", "😢", "😡", "🎉", "❤️",
  "🙏", "👏", "🔥", "🤔", "👀", "💯", "😅", "🤣",
  "😊", "🙌", "😭", "🙈", "💪", "🤝", "😎", "🥲",
];

const CELL = { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14 } as const;
// A cell lights up under the pointer, and darkens while it is pressed.
const CELL_FEEDBACK = {
  hoverStyle: { backgroundColor: "#eef1f4" },
  activeStyle: { backgroundColor: "#dde3ea" },
} as const;
// An emoji the user has put on this post: a light blue tint with a thin ring, so it reads as a pressed toggle.
const ON_STYLE = { backgroundColor: "#e6f2ff" } as const;
// The white chip the bar and its picker sit on: a soft shadow lifts it off the post.
const CHIP_SHADOW = "0 2px 8px rgba(0,0,0,0.14), 0 0 1px rgba(0,0,0,0.12)";

export function MessageActions(props: {
  /** The post these actions are for. */
  pid: string;
  /** The quick bar's emojis. Read in the render, so a pick that changes the bar shows at once. */
  quick: () => string[];
  /** The emojis the user already put on this post, shown highlighted. */
  mine: () => string[];
  onReact: (emoji: string) => void;
  /** Copies this post's own link. Every post has it, signed in or not. */
  onCopyLink: () => void;
  onQuote?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Called when the picker closes by a press outside it, by Escape, or by a pick from it, so the post can unhighlight. */
  onClose?: () => void;
}) {
  const bar = signal<ViewRef | null>(null);
  const picking = () => pickerOpenOn() === props.pid;
  const open = (on: boolean) => pickerOpenOn.set(on ? props.pid : null);
  const closeFromOutside = () => {
    open(false);
    props.onClose?.();
  };
  // A quick emoji on the bar: the bar stays up, since the pointer is still on the post.
  const reactFromBar = (emoji: string) => {
    open(false);
    props.onReact(emoji);
  };
  // An emoji picked from the grid: the grid closes, and the post unhighlights, since the pointer is over the grid.
  const reactFromGrid = (emoji: string) => {
    open(false);
    props.onReact(emoji);
    props.onClose?.();
  };

  return (
    <>
      <View
        ref={(n: ViewRef | null) => bar.set(n)}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          padding: 3,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: palette().border,
          backgroundColor: "#ffffff",
          boxShadow: CHIP_SHADOW,
        }}
      >
        {EMOJI_REACTIONS_ON ? props.quick().map((emoji, i) => (
          <View
            onPress={() => reactFromBar(emoji)}
            accessibilityLabel={`回应 ${emoji}`}
            tooltip={hint(`${emoji} (${i + 1})`)}
            {...CELL_FEEDBACK}
            style={{ ...CELL, ...(props.mine().includes(emoji) ? ON_STYLE : {}) }}
          >
            <Text style={{ fontSize: 15 }}>{emoji}</Text>
          </View>
        )) : null}
        {EMOJI_REACTIONS_ON ? (
        <View
          onPress={() => open(!picking())}
          accessibilityLabel="更多表情"
          tooltip={hint("更多表情")}
          {...CELL_FEEDBACK}
          style={CELL}
        >
          <SmileIcon size={16} />
        </View>
        ) : null}
        <View
          onPress={props.onCopyLink}
          accessibilityLabel="复制本帖链接"
          tooltip={hint("复制本帖链接")}
          {...CELL_FEEDBACK}
          style={CELL}
        >
          <LinkIcon size={16} />
        </View>
        {props.onQuote ? (
          <View onPress={props.onQuote} accessibilityLabel="引用"tooltip={hint("引用 (q)")} {...CELL_FEEDBACK} style={CELL}>
            <QuoteIcon size={16} />
          </View>
        ) : null}
        {props.onEdit ? (
          <View onPress={props.onEdit} accessibilityLabel="编辑"tooltip={hint("编辑 (e)")} {...CELL_FEEDBACK} style={CELL}>
            <PencilIcon size={16} />
          </View>
        ) : null}
        {props.onDelete ? (
          <View onPress={props.onDelete} accessibilityLabel="删除"tooltip={hint("删除")} {...CELL_FEEDBACK} style={CELL}>
            <TrashIcon size={16} />
          </View>
        ) : null}
      </View>
      {/* The picker sits under the bar, aligned to its right edge, above everything on the page. */}
      {EMOJI_REACTIONS_ON && picking() && bar() ? (
        <Overlay anchor={bar()} placement="bottom" align="end" offset={6} onPressOutside={closeFromOutside} onCancel={closeFromOutside}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              width: 6 * 32 + 16,
              gap: 2,
              padding: 8,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: palette().border,
              backgroundColor: "#ffffff",
              boxShadow: CHIP_SHADOW,
            }}
          >
            {EMOJI_CHOICES.map((emoji) => (
              <View
                onPress={() => reactFromGrid(emoji)}
                accessibilityLabel={`回应 ${emoji}`}
                {...CELL_FEEDBACK}
                style={{ ...CELL, ...(props.mine().includes(emoji) ? ON_STYLE : {}) }}
              >
                <Text style={{ fontSize: 16 }}>{emoji}</Text>
              </View>
            ))}
          </View>
        </Overlay>
      ) : null}
    </>
  );
}
