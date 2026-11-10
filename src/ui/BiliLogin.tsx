// The Bilibili sign-in page in a WebView. The user signs in there (QR code or
// password); the app only asks Bilibili afterwards whether the WebView is signed in.
import { signal, Text, View, WebView, type WebViewRef } from "nsh";
import { CHECK_LOGIN_JS, parseLoginMessage, setBiliSignedIn } from "../bilibili/session";
import { palette } from "./appearance";

const LOGIN_URL = "https://passport.bilibili.com/login";

// bilibili.com refuses the WebView's default user agent ("浏览器版本过低"); a desktop Safari string passes.
const SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function BiliLogin(props: { onSignedIn: () => void }) {
  const status = signal("未检查");
  let page!: WebViewRef;

  return (
    <View style={{ gap: 8, alignSelf: "stretch" }}>
      <WebView
        ref={page}
        src={LOGIN_URL}
        userAgent={SAFARI_UA}
        style={{ height: 320, backgroundColor: palette().surface }}
        onMessage={(e) => {
          const result = parseLoginMessage(e.data);
          if ("error" in result) {
            status.set(`检查失败：${result.error}`);
          } else if (result.isLogin) {
            setBiliSignedIn(true);
            status.set("已登录");
            props.onSignedIn();
          } else {
            setBiliSignedIn(false);
            status.set("未登录");
          }
        }}
      />
      <View
        onPress={() => page.injectJavaScript(CHECK_LOGIN_JS)}
        accessibilityLabel="Check Bilibili sign-in"
        style={{ paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: palette().selected }}
      >
        <Text style={{ fontSize: 13, color: palette().text }}>检查登录状态</Text>
      </View>
      <Text style={{ fontSize: 12, color: palette().muted }}>{`登录状态：${status()}`}</Text>
    </View>
  );
}
