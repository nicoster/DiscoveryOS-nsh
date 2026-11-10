// The post page's keyboard shortcuts, listed over the thread column when `?` is pressed, as
// Gmail's list is. A press outside the list, Escape or `?` again closes it.
import { Overlay, signal, Text, View, type YNode } from "nsh";
import { palette } from "./appearance";

export type Shortcut = { key: string; action: string };

// The keys that work anywhere in the Forum.
const GENERAL_SHORTCUTS: Shortcut[] = [
  { key: "/", action: "Search threads" },
  { key: "c", action: "New thread in this channel" },
  { key: "n", action: "Next thread" },
  { key: "p", action: "Previous thread" },
  { key: "?", action: "Show or hide this list" },
  { key: "Esc", action: "Close this list, or the search field" },
];

// The keys of an open thread, as well.
const POST_SHORTCUTS: Shortcut[] = [
  { key: "g g", action: "Go to the top of the replies" },
  { key: "G", action: "Go to the bottom of the replies" },
  { key: "r", action: "Reply: focus the reply box" },
  { key: "/", action: "Search threads" },
  { key: "c", action: "New thread in this channel" },
  { key: "n", action: "Next thread" },
  { key: "p", action: "Previous thread" },
  { key: "f", action: "Add the thread to favorites, or remove it" },
  { key: "q", action: "Quote the highlighted reply into the reply box" },
  { key: "?", action: "Show or hide this list" },
  { key: "Esc", action: "Close this list" },
];

/** The shortcuts that work now: the post page's, with a thread open, else the Forum's. */
export const shortcutsFor = (inThread: boolean): Shortcut[] => (inThread ? POST_SHORTCUTS : GENERAL_SHORTCUTS);

export function ShortcutsHelp(props: { keys: Shortcut[]; onClose: () => void }) {
  // The card's place, which the outside-press overlay is anchored to.
  const card = signal<YNode | null>(null);
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
          ref={(n: YNode | null) => card.set(n)}
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
