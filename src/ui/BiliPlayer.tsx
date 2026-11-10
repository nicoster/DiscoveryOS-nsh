// A Bilibili video linked from a post: a tap-to-play card that loads Bilibili's
// own player in a WebView. Members-only videos need the sign-in panel below it.
import { signal, Text, View, WebView, type YNode } from "nsh";
import { biliSignedIn, loadBiliSession } from "../bilibili/session";
import { playerRatio, videoShape, type VideoShape } from "../bilibili/video";
import { palette } from "./appearance";
import { BiliLogin } from "./BiliLogin";

const playerUrl = (bvid: string) => `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&autoplay=0`;

export function BiliPlayer(props: { bvid: string }) {
  const started = signal(false);
  const loginShown = signal(false);
  // 16:9 until the video's own size arrives, so the card keeps its shape while loading.
  const ratio = signal(playerRatio({ width: 16, height: 9 }));
  let player!: YNode;
  loadBiliSession();
  videoShape(props.bvid)
    .then((shape: VideoShape) => ratio.set(playerRatio(shape)))
    .catch(() => undefined);

  return (
    <View style={{ gap: 8, alignSelf: "stretch" }}>
      {started() ? (
        <WebView ref={player} src={playerUrl(props.bvid)} style={{ aspectRatio: ratio(), backgroundColor: "#000", borderRadius: 8 }} />
      ) : (
        <View
          onPress={() => started.set(true)}
          accessibilityLabel={`Play Bilibili video ${props.bvid}`}
          style={{ aspectRatio: ratio(), borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}
        >
          <Text style={{ fontSize: 16, color: "#fff" }}>{`▶ 播放 B 站视频 ${props.bvid}`}</Text>
        </View>
      )}
      <View onPress={() => loginShown.set(!loginShown())} accessibilityLabel="Bilibili sign-in">
        <Text style={{ fontSize: 12, color: palette().link }}>{biliSignedIn() ? "B 站已登录（点击查看）" : "登录 B 站（会员视频需要）"}</Text>
      </View>
      {loginShown() ? (
        <BiliLogin
          onSignedIn={() => {
            loginShown.set(false);
            // A player already loaded before signing in still shows the signed-out page: reload it.
            if (started()) player.reload();
          }}
        />
      ) : null}
    </View>
  );
}
