// One thread in a channel's list. When the list opens fresh its rows come in as a
// wave, top to bottom (`entering`); a row that comes later or is re-shown does not.
import { createMotion, Image, Text, View } from "nsh";
import type { Post } from "../discuz/parse";
import { timeAgo } from "../discuz/timeAgo";
import { palette } from "./appearance";

// The wave, as Spotish's `WAVE`: each row this long after the one before it, and
// only the first dozen take a turn; the rest come in with the last.
const STEP_MS = 55;
const TURNS = 12;

export function ThreadRow(props: {
  post: Post;
  index: number;
  entering: boolean;
  selected: () => boolean;
  avatar: () => string | undefined;
  onPress: () => void;
}) {
  // Made once, in the body: a motion made in a binding would play again on every change.
  const entrance = props.entering
    ? createMotion({ enter: "fadeInUp", delay: Math.min(props.index, TURNS) * STEP_MS })
    : undefined;
  const p = props.post;
  return (
    <View style={entrance?.style}>
      <View
        onPress={props.onPress}
        style={{
          padding: 8,
          borderRadius: 8,
          backgroundColor: props.selected() ? palette().selected : palette().surface,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {props.avatar() ? <Image src={props.avatar()!} style={{ width: 32, height: 32, borderRadius: 6 }} /> : null}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 13, color: palette().text }}>{p.title}</Text>
          <Text style={{ fontSize: 11, color: palette().muted }}>
            {[p.author, (p.lastReplyAt ?? p.at) ? timeAgo(p.lastReplyAt ?? p.at!) : undefined].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {/* Replies in a fixed right-hand column, so the counts line up down the list. */}
        <View style={{ width: 44, alignItems: "flex-end", gap: 1 }}>
          <Text style={{ fontSize: 13, color: palette().text }}>{String(p.replies)}</Text>
          <Text style={{ fontSize: 10, color: palette().muted }}>replies</Text>
        </View>
      </View>
    </View>
  );
}
