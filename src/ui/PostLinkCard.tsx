// A link preview inside a post: one card under the post's text for every floor the post links to.
// It reads like the comment cards under a post, but it belongs to the post itself, not to the
// thread: it sits inside the post's card, under the link's text, and opens that floor when pressed.
// A floor in the open thread needs no more context than its author and number; a floor in another
// thread also names that thread, so the reader can tell where the card leads.
import { Text, View } from "nsh";
import type { PostLink } from "../discuz/postLinks";
import { palette } from "./appearance";
import { previewState, threadTitle, type PostPreview } from "./postLinkPreview";

export function PostLinkCard(props: {
  link: PostLink;
  /** True when the floor is in another thread: the card also shows its title, date and more text. */
  foreign?: boolean;
  /** The floor when it is already loaded in the open thread: no request, and it follows the list. */
  local?: () => PostPreview | undefined;
  /** Opens the floor: jumps to it in this thread, or opens the other thread at it. */
  onPress: () => void;
}) {
  // The loaded list wins over the fetched page, so a floor the reader can already see shows at
  // once and keeps up with edits. Both are read here, so the card follows either when it changes.
  const shown = () => {
    const here = props.local?.();
    if (here) return { status: "ready" as const, preview: here };
    return previewState(props.link);
  };
  // The title travels with the thread, not the floor: a card still loading its own floor shows
  // the title as soon as any other card of that thread has read its page.
  const title = () => (props.foreign ? threadTitle(props.link.ptid) : undefined);
  const label = () => {
    const state = shown();
    const preview = state.preview;
    if (!preview) return state.status === "loading" ? "正在加载帖子…" : "无法预览该帖";
    return props.foreign && preview.at ? `${preview.name} · #${preview.seq} · ${preview.at}` : `${preview.name} · #${preview.seq}`;
  };
  const body = () => {
    const state = shown();
    const preview = state.preview;
    return preview ? preview.text || "点击查看该楼" : state.status === "loading" ? "…" : "点击查看该楼 ↗";
  };
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel="打开链接指向的楼层"
      style={{
        // Sized to its text rather than the post's column: short cards sit side by side in the
        // wrapping row, and no card grows past half of it, so two always fit on one line. The
        // half-row cap includes padding and border, or two cards would just overflow the row.
        alignSelf: "flex-start",
        boxSizing: "border-box",
        maxWidth: "46%",
        gap: 4,
        padding: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette().border,
        backgroundColor: palette().surface,
        backgroundImage: `linear-gradient(to bottom, ${palette().commentTop}, ${palette().commentBottom})`,
      }}
    >
      {title() ? (
        <Text style={{ fontSize: 13, fontWeight: 600, color: palette().text, numberOfLines: 2 }}>{`↗ ${title()}`}</Text>
      ) : null}
      <Text style={{ fontSize: 12, color: palette().muted, numberOfLines: 1 }}>{label()}</Text>
      <Text style={{ fontSize: 13, color: palette().muted, numberOfLines: props.foreign ? 4 : 3 }}>{body()}</Text>
    </View>
  );
}
