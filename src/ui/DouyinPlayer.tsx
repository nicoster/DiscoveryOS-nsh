// A Douyin video linked from a post: a tap-to-open card that loads the video's
// page in a WebView. Douyin's own page shows its sign-in (QR code) when a video
// needs it, and the WebView keeps that login, so there is no sign-in panel here.
import { signal, Text, View, WebView, type WebViewRef } from "nsh";
import { douyinPageUrl } from "../douyin/links";
import { resolveDouyinShort } from "../douyin/resolve";
import { palette } from "./appearance";

// The page is a whole site (the feed and the video in a modal), so it gets a fixed
// height rather than the video's shape.
const PLAYER_HEIGHT = 520;

/** A v.douyin.com short link: resolved to its video id, then shown as a DouyinPlayer. */
export function DouyinShortPlayer(props: { url: string }) {
  const id = signal<string | null>(null);
  const failed = signal(false);
  resolveDouyinShort(props.url)
    .then((v) => (v ? id.set(v) : failed.set(true)))
    .catch(() => failed.set(true));

  return id() ? (
    <DouyinPlayer id={id()!} />
  ) : (
    <Text style={{ fontSize: 12, color: palette().muted }}>{failed() ? `无法解析抖音短链接 ${props.url}` : "解析抖音短链接…"}</Text>
  );
}

export function DouyinPlayer(props: { id: string }) {
  const started = signal(false);
  let page!: WebViewRef;

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
