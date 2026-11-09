// A list or thread that could not load: one plain sentence and a Retry button.
// The reason goes to the debug console (`dbg`), never onto the screen.
import { Text, View } from "nsh";
import { palette } from "./appearance";

export function Failure(props: { message: string; onRetry: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 10, padding: 24 }}>
      <Text style={{ fontSize: 13, color: palette().muted, textAlign: "center" }}>{props.message}</Text>
      <View
        onPress={props.onRetry}
        accessibilityLabel="Retry"
        style={{
          paddingVertical: 6,
          paddingHorizontal: 14,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: palette().border,
          backgroundColor: palette().surface,
        }}
      >
        <Text style={{ fontSize: 13, color: palette().text }}>Retry</Text>
      </View>
    </View>
  );
}
