// A Xiaohongshu note linked from a post: a card that opens the note in the
// system browser. The site redirects an app's own requests in a loop, so the
// note cannot be shown inside the app.
import { Text, View } from "nsh";
import { palette } from "./appearance";
import { openLink } from "./links";

export function XhsCard(props: { link: string }) {
  return (
    <View
      onPress={() => void openLink(props.link)}
      accessibilityLabel="Open the Xiaohongshu note in the browser"
      style={{ padding: 12, gap: 6, borderRadius: 8, borderWidth: 1, borderColor: palette().border, alignSelf: "stretch" }}
    >
      <Text style={{ fontSize: 14, fontWeight: 600, color: palette().text }}>小红书笔记</Text>
      <Text style={{ fontSize: 12, color: palette().link }}>在浏览器中打开 ↗</Text>
    </View>
  );
}
