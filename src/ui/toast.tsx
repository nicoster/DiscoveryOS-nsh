// Short messages that come and go on their own: "Reply posted", "Added to favorites".
// A message with the same id replaces the one showing, rather than stacking a copy.
import { createMotion, signal, Text, View } from "nsh";
import { ToastManager, type ToastEntry } from "nsh/base";
import { palette } from "./appearance";

const TIMEOUT_MS = 3000;
const TICK_MS = 100;
const LIMIT = 3;

const manager = new ToastManager();
const shown = signal<ToastEntry[]>([]);
let ticking: ReturnType<typeof setInterval> | undefined;

function sync() {
  shown.set(manager.visible(LIMIT));
}

function tick() {
  const advanced = manager.advance(false);
  if (advanced.changed) sync();
  if (manager.isEmpty() && ticking !== undefined) {
    clearInterval(ticking);
    ticking = undefined;
  }
}

/** Shows `text` as toast `id` for a few seconds; again replaces it. */
export function notify(id: string, text: string): void {
  manager.push(id, text, { timeout: TIMEOUT_MS });
  sync();
  ticking ??= setInterval(tick, TICK_MS);
}

function ToastItem(props: { text: string }) {
  // Enters from below as it shows; leaves when its time runs out (no exit motion yet).
  const entrance = createMotion({ enter: "fadeInUp" });
  return (
    <View style={entrance.style}>
      <View
        accessibilityLabel={props.text}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: palette().border,
          backgroundColor: palette().surface,
        }}
      >
        <Text style={{ fontSize: 13, color: palette().text }}>{props.text}</Text>
      </View>
    </View>
  );
}

/** The toasts, at the bottom of the window. Place it in a view that fills the window. */
export function Toaster() {
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 16, alignItems: "center", gap: 6 }}>
      <Each of={shown()} key={(e: ToastEntry) => e.id}>
        {(entry) => <ToastItem text={String(entry().value)} />}
      </Each>
    </View>
  );
}
