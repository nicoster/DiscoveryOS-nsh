// The keyboard shortcuts that work now, listed over the window when `?` is pressed, as Gmail's list
// is. The rows come from the command catalog (`commands.ts`), so they follow what is shown. A press
// outside the list, Escape or `?` again closes it.
import { Overlay, signal, Text, View, type ViewRef } from "nsh";
import { palette } from "./appearance";

export type Shortcut = { key: string; action: string };

export function ShortcutsHelp(props: { keys: Shortcut[]; onClose: () => void }) {
  // The card's place, which the outside-press overlay is anchored to.
  const card = signal<ViewRef | null>(null);
  return (
    <>
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
          ref={(n: ViewRef | null) => card.set(n)}
          accessibilityLabel="Keyboard shortcuts"
          style={{
            width: 340,
            padding: 20,
            gap: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette().border,
            backgroundColor: palette().surface,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: 600, color: palette().text }}>Keyboard shortcuts</Text>
          {props.keys.map((s) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  minWidth: 56,
                  paddingVertical: 2,
                  paddingHorizontal: 6,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: palette().border,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12, color: palette().text }}>{s.key}</Text>
              </View>
              <Text style={{ fontSize: 13, color: palette().muted, flex: 1 }}>{s.action}</Text>
            </View>
          ))}
        </View>
      </View>
      {/* A press anywhere outside the card closes the list. Presses still reach what is under them. */}
      {card() ? (
        <Overlay anchor={card()} onPressOutside={props.onClose}>
          <View style={{ width: 0, height: 0 }} />
        </Overlay>
      ) : null}
    </>
  );
}
