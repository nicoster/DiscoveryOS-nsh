// The reply box under a thread's posts and under a private-message conversation: a
// multiline field with the send button at its right edge. Both screens share this one.
import { Text, View, type PasteEvent } from "nsh";
import { Input } from "nsh/base";
import { palette } from "./appearance";
import { PlaneIcon } from "./icons";

export function ReplyBox(props: {
  draft: () => string;
  onDraft: (text: string) => void;
  sending: () => boolean;
  uploading?: () => boolean;
  onSend: () => void;
  onPaste?: (e: PasteEvent) => void;
}) {
  return (
    <View style={{ alignSelf: "stretch", margin: 12, padding: 8, gap: 4, borderRadius: 8, backgroundColor: palette().surface }}>
      <Input
        placeholder="Reply"
        multiline={true}
        value={props.draft()}
        onChange={(text: string) => props.onDraft(text)}
        onPaste={props.onPaste}
        style={{ minHeight: 56, padding: 4, fontSize: 14, backgroundColor: "transparent" }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        {props.uploading?.() ? <Text style={{ fontSize: 12, color: palette().muted }}>Uploading…</Text> : null}
        <View
          onPress={props.sending() || props.uploading?.() || props.draft().length === 0 ? undefined : props.onSend}
          accessibilityLabel="Send"
          style={{ padding: 4 }}
        >
          <PlaneIcon size={18} enabled={() => !props.sending() && props.draft().length > 0} />
        </View>
      </View>
    </View>
  );
}
