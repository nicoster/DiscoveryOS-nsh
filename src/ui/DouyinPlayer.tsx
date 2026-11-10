// A Douyin video linked from a post: a tap-to-open card that loads the video's
// page in a WebView. Douyin's own page shows its sign-in (QR code) when a video
// needs it, and the WebView keeps that login, so there is no sign-in panel here.
import { signal, Text, View, WebView, type YNode } from "nsh";
import { douyinPageUrl } from "../douyin/links";
import { palette } from "./appearance";

// The page is a whole site (the feed and the video in a modal), so it gets a fixed
// height rather than the video's shape.
const PLAYER_HEIGHT = 520;

export function DouyinPlayer(props: { id: string }) {
  const started = signal(false);
  let page!: YNode;

  return (
    <View style={{ gap: 8, alignSelf: "stretch" }}>
      {started() ? (
        <WebView ref={page} src={douyinPageUrl(props.id)} style={{ height: PLAYER_HEIGHT, backgroundColor: "#000", borderRadius: 8 }} />
      ) : (
        <View
          onPress={() => started.set(true)}
          accessibilityLabel={`Open Douyin video ${props.id}`}
          style={{ height: PLAYER_HEIGHT, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}
        >
          <Text style={{ fontSize: 16, color: "#fff" }}>{`▶ 打开抖音视频 ${props.id}`}</Text>
        </View>
      )}
      <Text style={{ fontSize: 12, color: palette().muted }}>需要登录的视频，在页面中扫码登录即可</Text>
    </View>
  );
}
