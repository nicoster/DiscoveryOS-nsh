// The "loading more" indicator at the end of a list: three dots that take turns
// to light while a page loads. Mounted only while loading, so its timer runs
// only then. nsh has no public spinner component, so this is built from Views.
import { cleanup, signal, View } from "nsh";

export function LoadingBar() {
  const phase = signal(0);
  const timer = setInterval(() => phase.set((phase() + 1) % 3), 300);
  cleanup(() => clearInterval(timer));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 }}>
      {[0, 1, 2].map((i) => (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: phase() === i ? "#0969da" : "#d0d7de",
          }}
        />
      ))}
    </View>
  );
}
