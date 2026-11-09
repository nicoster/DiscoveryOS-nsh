// Placeholder rows shaped like a thread row, shown while a list's first page loads
// (when there is nothing cached to show). They pulse, as transitions.dev's skeleton does.
import { cleanup, signal, View } from "nsh";
import { palette } from "./appearance";

const ROWS = 8;
const PULSE_MS = 600;

export function ThreadSkeleton() {
  const dim = signal(false);
  const timer = setInterval(() => dim.set(!dim()), PULSE_MS);
  cleanup(() => clearInterval(timer));
  const bar = (width: number, height: number) => (
    <View style={{ width, height, borderRadius: 4, backgroundColor: palette().selected }} />
  );
  return (
    <View style={{ padding: 8, gap: 6, opacity: dim() ? 0.5 : 1 }}>
      {Array.from({ length: ROWS }, (_, i) => (
        <View style={{ padding: 8, borderRadius: 8, backgroundColor: palette().surface, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: palette().selected }} />
          <View style={{ flex: 1, gap: 6 }}>
            {bar(i % 3 === 0 ? 180 : 140, 12)}
            {bar(90, 9)}
          </View>
          <View style={{ width: 44, alignItems: "flex-end", gap: 4 }}>{bar(18, 12)}</View>
        </View>
      ))}
    </View>
  );
}
