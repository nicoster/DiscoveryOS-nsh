// One post in the forum's style: the avatar on the left, and beside it the meta line over
// the body. Threads and private-message conversations both show their posts this way.
import { createMotion, Image, Text, View, type JSX, type ViewRef } from "nsh";
import { palette } from "./appearance";

/** A reply that quotes this post, shown under it as a comment: its author, floor and text. */
export type ReplyComment = { id: string; name: string; seq: number; text: string };

/** One comment card under a post. A card added after the post's comments were shown fades up as it appears. */
function CommentCard(props: { comment: ReplyComment; fresh: boolean; marginTop: number; onPress?: () => void }) {
  const c = props.comment;
  const entrance = props.fresh ? createMotion({ enter: "fadeInUp", duration: 220 }) : undefined;
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel="跳到这条回复"
      style={{
        ...(entrance?.style ?? {}),
        position: "relative",
        // Sized to its text (not stretched to the column), wrapping at the column's width.
        alignSelf: "flex-start",
        marginTop: props.marginTop,
        gap: 4,
        padding: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette().border,
        backgroundColor: palette().surface,
        // Darker at the top, lighter at the bottom.
        backgroundImage: `linear-gradient(to bottom, ${palette().commentTop}, ${palette().commentBottom})`,
      }}
    >
      <Text style={{ fontSize: 12, color: palette().muted }}>{`${c.name} · #${c.seq}`}</Text>
      <Text style={{ fontSize: 13, color: palette().muted }}>{c.text}</Text>
    </View>
  );
}

export function ReplyCard(props: {
  /** The reply this card shows, so a recycled row that now shows another reply does not animate its comments in. */
  id?: string;
  avatar?: string;
  name: string;
  /** Whether the post is by the thread's author (楼主), shown as a tag beside the name. */
  isOp?: boolean;
  meta: string;
  /** Controls at the end of the meta line. */
  trailing?: JSX.Element | null;
  body: JSX.Element;
  /** The bar of actions that hovers over the post while it is highlighted. */
  actionBar?: JSX.Element | null;
  /** The emojis the user put on this post, shown as chips under the body. Read reactively. */
  reactions?: () => string[];
  /** Called with an emoji when its chip is pressed (takes the reaction off). */
  onReactionPress?: (emoji: string) => void;
  /** Replies that quote this post, shown under the body as comments. Read reactively, so a
   * reply loaded later (on another page) shows up here. */
  comments?: () => ReplyComment[];
  /** Called with a comment's reply id when its card is pressed (the list goes to that floor). */
  onCommentPress?: (pid: string) => void;
  /** Whether the post is highlighted (the pointer is over it, so `q` quotes it). */
  highlighted?: () => boolean;
  /** Whether the post is the one the list has just jumped to, shown in yellow for a moment. */
  flashed?: () => boolean;
  /** Receives the post's own card, so the list can tell whether it is on screen. */
  cardRef?: (n: ViewRef | null) => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
}) {
  // The comment ids already shown for the reply on this row. A card whose id is not here was just added, so it animates.
  let shownFor: string | undefined;
  let shown = new Set<string>();
  let started = false;
  function commentCards(list: ReplyComment[]) {
    // A recycled row shows another reply: its current comments are the baseline, so none of them animate.
    if (!started || props.id !== shownFor) {
      started = true;
      shownFor = props.id;
      shown = new Set(list.map((c) => c.id));
    }
    return list.map((c, i) => {
      const fresh = !shown.has(c.id);
      shown.add(c.id);
      return (
        <CommentCard
          comment={c}
          fresh={fresh}
          // Each comment card is pulled up over the one above, so it overlaps the one above it.
          marginTop={i > 0 ? -6 : 0}
          onPress={() => props.onCommentPress?.(c.id)}
        />
      );
    });
  }
  // The post's card and the comment cards below it are siblings, not nested: each comment card is
  // indented and pulled up a little, so its top edge sits over the bottom of the post's card.
  return (
    <View style={{ alignSelf: "stretch" }}>
      <View
        ref={(n: ViewRef | null) => props.cardRef?.(n)}
        onMouseEnter={props.onHoverIn}
        onMouseLeave={props.onHoverOut}
        style={{
          // Relative, so the action bar sits over this post and not a wider ancestor. A highlighted
          // post stacks above the posts below it, so its bar and emoji picker are not covered by them.
          position: "relative",
          zIndex: props.highlighted?.() ? 10 : 0,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
          padding: 10,
          borderRadius: 8,
          backgroundColor: props.flashed?.() ? palette().jumpHighlight : props.highlighted?.() ? palette().replyHighlight : palette().surface,
        }}
      >
        {/* Two columns, as the Swift app: the avatar on the left, and beside it the meta line
            over the body, so the body starts under the name. */}
        {props.avatar ? <Image src={props.avatar} style={{ width: 36, height: 36, borderRadius: 6 }} /> : <View style={{ width: 36 }} />}
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: 600, color: palette().text }}>{props.name}</Text>
            {props.isOp ? (
              <View style={{ paddingHorizontal: 2, paddingVertical: 1, borderRadius: 4, backgroundColor: palette().border }}>
                <Text style={{ fontSize: 11, color: palette().muted }}>楼主</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: 12, color: palette().muted }}>{props.meta}</Text>
            {props.trailing}
          </View>
          {props.body}
          {/* Read inside the JSX, so the chips follow the user's reactions as they change. */}
          {props.reactions && props.reactions().length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {props.reactions().map((emoji) => (
                <View
                  onPress={() => props.onReactionPress?.(emoji)}
                  accessibilityLabel="取消此回应"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 14,
                    backgroundColor: "#e6f2ff",
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  {/* Only the user's own reaction is known for now, so the count is 1; server counts replace it later. */}
                  <Text style={{ fontSize: 13, color: "#1d6fd1" }}>{"1"}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {/* Read inside the JSX, so the bar appears while the post is highlighted. */}
        {props.highlighted?.() && props.actionBar ? props.actionBar : null}
      </View>
      {/* Read inside the JSX, so the row follows the comments as its reply changes (a row is reused for other replies). */}
      {props.comments && props.comments().length > 0 ? (
        // Relative and above the highlighted post (z 10), so the comment cards are not covered by its hover layer.
        // The comment cards overlap like the post: each is pulled up over the one above, and later cards paint on top.
        <View style={{ position: "relative", zIndex: 11, marginLeft: 44, marginRight: -5, marginTop: -6 }}>
          {commentCards(props.comments())}
        </View>
      ) : null}
    </View>
  );
}
