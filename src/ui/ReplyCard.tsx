// One post in the forum's style: the avatar on the left, and beside it the meta line over
// the body. Threads and private-message conversations both show their posts this way.
import { Image, Text, View, type JSX } from "nsh";
import { palette } from "./appearance";

export function ReplyCard(props: {
  avatar?: string;
  name: string;
  meta: string;
  /** Controls at the end of the meta line, such as Quote. */
  trailing?: JSX.Element | null;
  body: JSX.Element;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 8, backgroundColor: palette().surface }}>
      {/* Two columns, as the Swift app: the avatar on the left, and beside it the meta line
          over the body, so the body starts under the name. */}
      {props.avatar ? <Image src={props.avatar} style={{ width: 36, height: 36, borderRadius: 6 }} /> : <View style={{ width: 36 }} />}
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 13, color: palette().text }}>{props.name}</Text>
          <Text style={{ fontSize: 12, color: palette().muted }}>{props.meta}</Text>
          {props.trailing}
        </View>
        {props.body}
      </View>
    </View>
  );
}
