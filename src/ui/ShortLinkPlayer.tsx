// A short link in a post, shown as its video once it resolves. While it resolves it shows a
// line of text; if it does not resolve in time (or at all), the short link itself is shown
// in a WebView, so the video is still reachable.
import { signal, Text, View, WebView, type JSX } from "nsh";
import { palette } from "./appearance";
import { VIDEO_FULLSCREEN_SCRIPT } from "./webviewFullscreen";

export function ShortLinkPlayer<T>(props: {
  url: string;
  resolve: (url: string) => Promise<T | null>;
  /** The video card for a resolved value. */
  play: (value: T) => JSX.Element;
  /** Shown while the link resolves, e.g. "解析 B 站短链接…". */
  pending: string;
  /** Size of the fallback WebView: its height, or its shape. */
  fallbackSize: { height?: number; aspectRatio?: number };
}) {
  const value = signal<T | null>(null);
  const fallback = signal(false);
  props
    .resolve(props.url)
    .then((v) => (v ? value.set(v) : fallback.set(true)))
    .catch(() => fallback.set(true));

  // The branch is read inside the JSX, so it updates when the signals change. A plain
  // `if (value()) return …` would be read once, when the component first runs.
  return (
    <View style={{ alignSelf: "stretch" }}>
      {value() ? (
        props.play(value()!)
      ) : fallback() ? (
        <WebView
          src={props.url}
          injectedJavaScript={VIDEO_FULLSCREEN_SCRIPT}
          style={{ ...props.fallbackSize, backgroundColor: "#000", borderRadius: 8 }}
        />
      ) : (
        <Text style={{ fontSize: 12, color: palette().muted }}>{props.pending}</Text>
      )}
    </View>
  );
}
