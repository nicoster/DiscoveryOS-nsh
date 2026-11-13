// One post in the forum's style: the avatar on the left, and beside it the meta line over
// the body. Threads and private-message conversations both show their posts this way.
import { Image, Text, View, type JSX } from "nsh";
import { palette } from "./appearance";

/** A reply that quotes this post, shown under it as a comment: its author, floor and text. */
export type ReplyComment = { id: string; name: string; seq: number; text: string };

export function ReplyCard(props: {
  avatar?: string;
  name: string;
  /** Whether the post is by the thread's author (楼主), shown as a tag beside the name. */
  isOp?: boolean;
  meta: string;
  /** Controls at the end of the meta line, such as Quote. */
  trailing?: JSX.Element | null;
  body: JSX.Element;
  /** Replies that quote this post, shown under the body as comments. Read reactively, so a
   * reply loaded later (on another page) shows up here. */
  comments?: () => ReplyComment[];
  /** Called with a comment's reply id when its card is pressed (the list goes to that floor). */
  onCommentPress?: (pid: string) => void;
  /** Whether the post is highlighted (the pointer is over it, so `q` quotes it). */
  highlighted?: () => boolean;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
}) {
  // The post's card and the comment cards below it are siblings, not nested: each comment card is
  // indented and pulled up a little, so its top edge sits over the bottom of the post's card.
  return (
    <View style={{ alignSelf: "stretch" }}>
      <View
        onMouseEnter={props.onHoverIn}
        onMouseLeave={props.onHoverOut}
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
          padding: 10,
          borderRadius: 8,
          backgroundColor: props.highlighted?.() ? palette().replyHighlight : palette().surface,
        }}
      >
        {/* Two columns, as the Swift app: the avatar on the left, and beside it the meta line
            over the body, so the body starts under the name. */}
        {props.avatar ? <Image src={props.avatar} style={{ width: 36, height: 36, borderRadius: 6 }} /> : <View style={{ width: 36 }} />}
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 13, color: palette().text }}>{props.name}</Text>
            {props.isOp ? (
              <View style={{ paddingHorizontal: 2, paddingVertical: 1, borderRadius: 4, backgroundColor: palette().border }}>
                <Text style={{ fontSize: 11, color: palette().muted }}>楼主</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: 12, color: palette().muted }}>{props.meta}</Text>
            {props.trailing}
          </View>
          {props.body}
        </View>
      </View>
      {/* Read inside the JSX, so the row follows the comments as its reply changes (a row is reused for other replies). */}
      {props.comments && props.comments().length > 0 ? (
        <View style={{ gap: 8, marginLeft: 44, marginRight: -5, marginTop: -6 }}>
          {props.comments().map((c) => (
            <View
              onPress={() => props.onCommentPress?.(c.id)}
              accessibilityLabel="Go to this reply"
              style={{
                gap: 4,
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: palette().border,
                backgroundColor: palette().surface,
              }}
            >
              <Text style={{ fontSize: 12, color: palette().muted }}>{`${c.name} · #${c.seq}`}</Text>
              <Text style={{ fontSize: 13, color: palette().muted }}>{c.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
