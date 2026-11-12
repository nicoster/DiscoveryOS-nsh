// About DiscoveryOS: the running build, the kept package and the last update check. The same app-drawn
// dialog on every platform (no native About panel). Opened from the About menu items (`commands.ts`);
// a press outside the card or Close dismisses it.
import { Overlay, signal, Text, View, type ViewRef } from "nsh";
import { Updater } from "discoveryos/native";
import { palette } from "./appearance";

/** Whether the About dialog is shown. Set from the menu; read by the app root. */
export const aboutOpen = signal(false);

export function openAbout(): void {
  aboutOpen.set(true);
}

function closeAbout(): void {
  aboutOpen.set(false);
}

// Builds are Unix times, which read better in hex: shown as uppercase digits, no prefix.
function hexBuild(value: unknown): string {
  return Number(value ?? 0).toString(16).toUpperCase();
}

// The lines About shows, from the runner's JSON (the same fields the macOS panel reads).
function aboutLines(): string[] {
  let info: Record<string, unknown> = {};
  try {
    info = JSON.parse(Updater.aboutInfo()) as Record<string, unknown>;
  } catch {
    return ["Details unavailable."];
  }
  const source = info.runningSource === "package" ? "update package" : "embedded";
  const lines = [
    `Version ${String(info.runningVersion ?? "?")}`,
    `Running build ${hexBuild(info.runningBuild)} (${source})`,
    `Embedded: ${String(info.embeddedVersion ?? "?")} · build ${hexBuild(info.embeddedBuild)}`,
  ];
  const pkg = info.package as Record<string, unknown> | null | undefined;
  if (pkg && typeof pkg === "object") {
    lines.push(`Package: ${String(pkg.version ?? "?")} · build ${hexBuild(pkg.build)}`);
    const sha = typeof pkg.sha256 === "string" ? pkg.sha256 : "";
    lines.push(`SHA-256: ${sha.slice(0, 16)}…`);
    lines.push(`Key: ${String(pkg.keyId ?? "?")}`);
  } else if (info.pendingSwap === true) {
    lines.push("Package: swapped in, waiting for the health check");
  }
  const last = typeof info.lastCheck === "string" ? info.lastCheck : "";
  lines.push(`Last check: ${last || "not yet"}`);
  return lines;
}

export function AboutDialog() {
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
          accessibilityLabel="About DiscoveryOS"
          style={{
            width: 360,
            padding: 20,
            gap: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette().border,
            backgroundColor: palette().surface,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: 600, color: palette().text }}>DiscoveryOS</Text>
          {aboutLines().map((line) => (
            <Text style={{ fontSize: 12, color: palette().muted }}>{line}</Text>
          ))}
          <View
            onPress={closeAbout}
            accessibilityLabel="Close"
            style={{
              alignSelf: "flex-end",
              marginTop: 8,
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: palette().border,
            }}
          >
            <Text style={{ fontSize: 13, color: palette().text }}>Close</Text>
          </View>
        </View>
      </View>
      {card() ? (
        <Overlay anchor={card()} onPressOutside={closeAbout}>
          <View style={{ width: 0, height: 0 }} />
        </Overlay>
      ) : null}
    </>
  );
}
