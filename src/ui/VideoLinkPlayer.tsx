// A video link in a post that no other module plays: its page (or file) opens in a WebView.
// If the WebView cannot open it, a line of text says so.
import { signal, Text, View, WebView } from "nsh";
import { palette } from "./appearance";
import { VIDEO_FULLSCREEN_SCRIPT } from "./webviewFullscreen";

export function VideoLinkPlayer(props: { url: string }) {
  const failed = signal<string | null>(null);
  // The branch is read inside the JSX, so it updates when the signal changes.
  return (
    <View style={{ alignSelf: "stretch" }}>
      {failed() !== null ? (
        <Text style={{ fontSize: 12, color: palette().muted }}>{`无法打开视频 ${props.url}（${failed()}）`}</Text>
      ) : (
        <WebView
          src={props.url}
          injectedJavaScript={VIDEO_FULLSCREEN_SCRIPT}
          onError={(e) => failed.set(e.code ?? e.message)}
          style={{ aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 8 }}
        />
      )}
    </View>
  );
}
