// One thread in a channel's list. A `List` recycles its rows for other threads as the user
// scrolls, so a row reads its thread through `item()` rather than holding it, and keeps no
// state of its own beyond its hover animation, which a hover-out always settles.
import { createAnimatedValue, Image, Text, View } from "nsh";
import type { Post } from "../discuz/parse";
import { timeAgo } from "../discuz/timeAgo";
import { palette } from "./appearance";

function meta(p: Post): string {
  return [p.author, (p.lastReplyAt ?? p.at) ? timeAgo(p.lastReplyAt ?? p.at!) : undefined].filter(Boolean).join(" · ");
}

export function ThreadRow(props: {
  item: () => Post;
  selected: () => boolean;
  avatar: () => string | undefined;
  // Whether the thread is a favorite: a solid star before its title.
  favorite: () => boolean;
  onPress: () => void;
}) {
  // The avatar swells as the row is hovered, as the Dock's icons do.
  const hover = createAnimatedValue(0);
  const avatarScale = hover.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  return (
    <View
      onPress={props.onPress}
      onMouseEnter={() => {
        hover.timing(1, { duration: 120 }).catch(() => undefined);
      }}
      onMouseLeave={() => {
        hover.timing(0, { duration: 120 }).catch(() => undefined);
      }}
      style={{
        padding: 8,
        borderRadius: 8,
        backgroundColor: props.selected() ? palette().selected : palette().surface,
        // A pinned thread sits at the top whatever its reply time, so it is greyed to read as pinned.
        opacity: props.item().pinned ? 0.5 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      {props.avatar() ? (
        <View style={{ transform: [{ scale: avatarScale }] }}>
          <Image src={props.avatar()!} style={{ width: 32, height: 32, borderRadius: 6 }} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 3 }}>
        {/* A favorite's star is a span of the title's own text, so it sits on the first line and wraps with it. */}
        <Text style={{ fontSize: 13, color: palette().text }}>
          {props.favorite() ? <Text style={{ fontSize: 11, color: palette().muted }}>{"★ "}</Text> : null}
          {props.item().title}
        </Text>
        {/* My Replies rows: the reply's text takes the second line, and the time moves to the right. */}
        {props.item().excerpt !== undefined ? (
          props.item().excerpt ? <Text style={{ fontSize: 12, color: palette().muted }}>{props.item().excerpt}</Text> : null
        ) : (
          <Text style={{ fontSize: 11, color: palette().muted }}>{meta(props.item())}</Text>
        )}
      </View>
      {props.item().excerpt !== undefined ? (
        <View style={{ width: 64, alignItems: "flex-end" }}>
          <Text style={{ fontSize: 11, color: palette().muted }}>{timeAgo((props.item().lastReplyAt ?? props.item().at) ?? "")}</Text>
        </View>
      ) : null}
      {/* Replies in a fixed right-hand column, so the counts line up down the list. Lists
          that carry no count (the user's own threads) leave the column out. */}
      {props.item().replies === undefined ? null : (
        <View style={{ width: 44, alignItems: "flex-end", gap: 1 }}>
          <Text style={{ fontSize: 13, color: palette().text }}>{String(props.item().replies)}</Text>
          <Text style={{ fontSize: 10, color: palette().muted }}>replies</Text>
        </View>
      )}
    </View>
  );
}
