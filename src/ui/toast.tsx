// Every message the app shows that comes and goes on its own, at the window's top-right:
// "Reply posted", "Couldn't load threads", "Offline: the saved login is kept". A message with the same id replaces the one
// showing, rather than stacking a copy. A message with a tap action (a failed load's retry)
// runs the action when tapped and hides itself.
import { createMotion, signal, Text, View } from "nsh";
import { ToastManager, type ToastEntry } from "nsh/base";
import { palette } from "./appearance";

const TIMEOUT_MS = 3000;
// Messages a tap can act on stay longer, so there is time to read them and tap.
const ACTION_TIMEOUT_MS = 6000;
const TICK_MS = 100;
const LIMIT = 3;

const manager = new ToastManager();
const shown = signal<ToastEntry[]>([]);
const actions = new Map<string, () => void>();
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

/** Shows `text` as toast `id` for a few seconds; again replaces it. `onTap` runs when it is tapped. */
export function notify(id: string, text: string, onTap?: () => void): void {
  if (onTap) actions.set(id, onTap);
  else actions.delete(id);
  manager.push(id, text, { timeout: onTap ? ACTION_TIMEOUT_MS : TIMEOUT_MS });
  sync();
  ticking ??= setInterval(tick, TICK_MS);
}

function tap(id: string) {
  const run = actions.get(id);
  actions.delete(id);
  manager.dismiss(id);
  sync();
  run?.();
}

function ToastItem(props: { text: string; onPress?: () => void }) {
  // Enters from below as it shows; leaves when its time runs out (no exit motion yet).
  const entrance = createMotion({ enter: "fadeInUp" });
  return (
    <View style={entrance.style}>
      <View
        onPress={props.onPress}
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

/** The toasts, in the window's top-right corner. Place it in a view that fills the window. */
export function Toaster() {
  return (
    <View style={{ position: "absolute", top: 12, right: 12, alignItems: "flex-end", gap: 6 }}>
      <Each of={shown()} key={(e: ToastEntry) => e.id}>
        {(entry) => <ToastItem text={String(entry().value)} onPress={actions.has(entry().id) ? () => tap(entry().id) : undefined} />}
      </Each>
    </View>
  );
}
