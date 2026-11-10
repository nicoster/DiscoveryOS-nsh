// Debug: a dialog where the user pastes cookies to import, opened from the Help menu (`commands.ts`).
// The pasted text is a live session credential: it is never logged or shown after the dialog closes.
import { Clipboard, signal, Text, View, type JSX } from "nsh";
import { Input } from "nsh/base";
import { importCookies } from "../discuz/cookies";
import { palette } from "./appearance";
import { notify } from "./toast";

/** Whether the import dialog is shown. Set from the Help menu; read by the app root. */
export const cookieImportOpen = signal(false);

// The pasted text lives at module scope, not in the component body: a signal made while rendering
// is not guaranteed to survive a re-render, so the import could read a stale or empty value.
const pastedText = signal("");

export function openCookieImport(): void {
  cookieImportOpen.set(true);
}

function DialogButton(props: { label: string; disabled?: boolean; secondary?: boolean; onPress: () => void }) {
  const secondary = props.secondary === true;
  return (
    <View
      onPress={props.disabled ? undefined : props.onPress}
      style={{
        backgroundColor: secondary ? palette().surface : props.disabled ? palette().buttonDisabled : palette().button,
        borderWidth: secondary ? 1 : 0,
        borderColor: palette().border,
        borderRadius: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontSize: 13, color: secondary ? palette().text : palette().buttonText }}>{props.label}</Text>
    </View>
  );
}

export function CookieImportDialog(): JSX.Element {
  function close(): void {
    pastedText.set("");
    cookieImportOpen.set(false);
  }

  // Fills the field from the clipboard, for when the field's own Paste is not offered.
  async function pasteFromClipboard(): Promise<void> {
    try {
      pastedText.set(await Clipboard.readText());
    } catch (e) {
      notify("cookies", `Could not read the clipboard: ${e}`);
    }
  }

  function doImport(): void {
    const count = importCookies(pastedText());
    if (count > 0) {
      notify("cookies", `Imported ${count} cookies. Restart the app to sign in with them.`);
      close();
    } else {
      notify("cookies", "No cookies found in the text. Paste JSON or a Cookie header.");
    }
  }

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.35)",
      }}
    >
      <View
        style={{
          width: 420,
          padding: 16,
          gap: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette().border,
          backgroundColor: palette().surface,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: 600, color: palette().text }}>Import Session Cookies</Text>
        <Text style={{ fontSize: 12, color: palette().text }}>
          Paste the cookies as a JSON object or as a Cookie header (a=1; b=2).
        </Text>
        <Input
          placeholder="Paste cookies here"
          multiline={true}
          value={pastedText()}
          onChange={({ value }: { value: string }) => pastedText.set(value)}
          style={{ height: 120, padding: 8, fontSize: 12 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <DialogButton label="Paste from Clipboard" secondary={true} onPress={() => void pasteFromClipboard()} />
          <DialogButton label="Cancel" secondary={true} onPress={close} />
          <DialogButton label="Import" disabled={pastedText().trim().length === 0} onPress={doImport} />
        </View>
      </View>
    </View>
  );
}
