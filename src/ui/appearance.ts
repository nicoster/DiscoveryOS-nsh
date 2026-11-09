// Light and dark colors of the app's own views (the GitHub-style palette the
// app was built with, and its dark counterpart), and the appearance setting:
// system, light or dark. The setting is kept in the app's storage.
import { colorScheme, setColorScheme, signal, Storage } from "nsh";

export type AppearanceMode = "system" | "light" | "dark";

export interface Palette {
  bg: string;
  text: string;
  muted: string;
  link: string;
  border: string;
  surface: string;
  selected: string;
  danger: string;
  button: string;
  buttonText: string;
  buttonDisabled: string;
}

const LIGHT: Palette = {
  bg: "#ffffff",
  text: "#1f2328",
  muted: "#57606a",
  link: "#0969da",
  border: "#d0d7de",
  surface: "#f6f8fa",
  selected: "#dbe4ff",
  danger: "#cf222e",
  button: "#1f2328",
  buttonText: "#ffffff",
  buttonDisabled: "#8c959f",
};

const DARK: Palette = {
  bg: "#0d1117",
  text: "#e6edf3",
  muted: "#8d96a0",
  link: "#4493f8",
  border: "#3d444d",
  surface: "#161b22",
  selected: "#1c2d4a",
  danger: "#f85149",
  button: "#e6edf3",
  buttonText: "#0d1117",
  buttonDisabled: "#484f58",
};

/** The palette of the appearance shown (reactive: reading it in JSX follows the setting). */
export function palette(): Palette {
  return colorScheme() === "dark" ? DARK : LIGHT;
}

const STORAGE_KEY = "appearance";
const MODES: AppearanceMode[] = ["system", "light", "dark"];

const NAMES: Record<AppearanceMode, string> = { system: "Auto", light: "Light", dark: "Dark" };

/** The name of a setting as the button shows it. */
export function appearanceName(mode: AppearanceMode): string {
  return NAMES[mode];
}

/** The setting the user chose (reactive). */
export const appearanceMode = signal<AppearanceMode>("system");

export function applyAppearance(mode: AppearanceMode) {
  appearanceMode.set(mode);
  setColorScheme(mode);
}

/** Moves to the next setting (system → light → dark → system) and remembers it. */
export function cycleAppearance() {
  const next = MODES[(MODES.indexOf(appearanceMode()) + 1) % MODES.length];
  applyAppearance(next);
  Storage.setItem(STORAGE_KEY, next).catch(() => undefined);
}

/** Applies the setting saved by an earlier launch, if any. */
export function restoreAppearance() {
  Storage.getItem(STORAGE_KEY)
    .then((value) => {
      if (value === "system" || value === "light" || value === "dark") applyAppearance(value);
    })
    .catch(() => undefined);
}
