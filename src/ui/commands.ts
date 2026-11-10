// The app's commands: one catalog of their titles, keys and menu places, the behaviour each view
// gives them while it is shown, and the menu bar and shortcut list built from both. A key that
// types (`/`, `n`, `r`) is bound through the keymap and is left out of the native menu's shortcut
// field, so the menu cannot fire it while a text field has the focus; chords with a modifier
// (`mod+r`) are bound the same way, so every shortcut has one path.
import { Clipboard, cleanup, effect, keymap, signal, untracked } from "nsh";
import { isAvailable, Menu, type MenuItem, type MenuRole } from "nsh/desktop";
import { debugEnabled } from "../debugLog";
import { exportCookies } from "../discuz/cookies";
import { appearanceMode, appearanceName, chooseAppearance, type AppearanceMode } from "./appearance";
import { openCookieImport } from "./CookieImport";

export type CommandId =
  | "forum.search"
  | "forum.refresh"
  | "forum.next"
  | "forum.prev"
  | "forum.compose"
  | "forum.shortcuts"
  | "thread.top"
  | "thread.bottom"
  | "thread.reply"
  | "thread.favorite"
  | "thread.quote"
  | "reply.send";

interface Definition {
  /** The menu item's and the list's name. */
  title: string;
  /** The keystrokes that run it, as `nsh/keymap` names them. */
  keys?: string[];
  /** Shown instead of the keys (a chord such as `g g`, or a symbol the keys do not read as). */
  hint?: string;
  /** Its place in the shortcut list. */
  order: number;
}

// The titles and keys of every command. A view supplies only how the command behaves.
const CATALOG: Record<CommandId, Definition> = {
  "forum.search": { title: "Search Threads", keys: ["/", "mod+f"], order: 10 },
  "forum.refresh": { title: "Refresh", keys: ["mod+r"], order: 20 },
  "forum.next": { title: "Next Thread", keys: ["n"], order: 30 },
  "forum.prev": { title: "Previous Thread", keys: ["p"], order: 40 },
  "forum.compose": { title: "New Thread", keys: ["c"], order: 50 },
  "forum.shortcuts": { title: "Keyboard Shortcuts", keys: ["shift+/"], hint: "?", order: 60 },
  "thread.top": { title: "Go to Top of Replies", hint: "g g", order: 100 },
  "thread.bottom": { title: "Go to Bottom of Replies", keys: ["shift+g"], hint: "G", order: 110 },
  "thread.reply": { title: "Reply", keys: ["r"], order: 120 },
  "thread.favorite": { title: "Favorite Thread", keys: ["f"], order: 130 },
  "thread.quote": { title: "Quote Highlighted Reply", keys: ["q"], order: 140 },
  "reply.send": { title: "Send Reply", keys: ["mod+enter"], order: 150 },
};

/** What a view gives a command while it is shown. */
export interface Behavior {
  /** Whether it can run now; a dimmed menu item when false. Default true. */
  enabled?: () => boolean;
  /** Its check mark, for a choice that is on. */
  checked?: () => boolean;
  run: () => void;
}

const stacks = new Map<CommandId, { behavior: Behavior }[]>();
// Counts up on every change of the registry, so the menu and the list follow it.
const changes = signal(0);

function bump() {
  changes.set(untracked(() => changes()) + 1);
}

function register(id: CommandId, behavior: Behavior): () => void {
  const entry = { behavior };
  const stack = stacks.get(id) ?? [];
  stack.push(entry);
  stacks.set(id, stack);
  bump();
  return () => {
    const current = stacks.get(id);
    if (!current) return;
    const at = current.indexOf(entry);
    if (at >= 0) current.splice(at, 1);
    if (current.length === 0) stacks.delete(id);
    bump();
  };
}

/** The behaviour of the newest view that registered `id`, or undefined while none is shown. Reactive. */
function live(id: CommandId): Behavior | undefined {
  changes();
  const stack = stacks.get(id);
  return stack?.[stack.length - 1]?.behavior;
}

function hintOf(def: Definition): string | undefined {
  if (def.hint) return def.hint;
  return def.keys?.map((k) => keymap.label(k)).join(" or ");
}

/** Binds a command's keys and lists it in the menu and the shortcut list while the calling view is shown. */
export function useCommand(id: CommandId, behavior: Behavior): void {
  const def = CATALOG[id];
  for (const key of def.keys ?? []) {
    keymap.bind(
      key,
      () => {
        const current = live(id) ?? behavior;
        if (current.enabled?.() ?? true) current.run();
      },
      { when: key.startsWith("mod+") ? "always" : "notEditing" },
    );
  }
  cleanup(register(id, behavior));
}

/** The shortcut list's rows: the commands shown now that have a shortcut, in catalog order, then Escape. */
export function shortcutRows(): { key: string; action: string }[] {
  changes();
  const rows = (Object.keys(CATALOG) as CommandId[])
    .filter((id) => live(id) !== undefined && hintOf(CATALOG[id]) !== undefined)
    .sort((a, b) => CATALOG[a].order - CATALOG[b].order)
    .map((id) => ({ key: hintOf(CATALOG[id])!, action: CATALOG[id].title }));
  return [...rows, { key: "Esc", action: "Close this list, or the search field" }];
}

const SEPARATOR: MenuItem = { type: "separator" };

function role(name: MenuRole): MenuItem {
  return { role: name };
}

function submenu(label: string, items: MenuItem[]): MenuItem {
  return { label, submenu: items };
}

// A catalog command as a menu item: its title and hint, dimmed unless a view shows it and it can run now.
function item(id: CommandId): MenuItem {
  const def = CATALOG[id];
  const hint = hintOf(def);
  const behavior = live(id);
  const enabled = behavior !== undefined && (behavior.enabled?.() ?? true);
  return {
    label: hint ? `${def.title}  (${hint})` : def.title,
    disabled: !enabled,
    checked: behavior?.checked?.(),
    onSelect: () => {
      const current = live(id);
      if (current && (current.enabled?.() ?? true)) current.run();
    },
  };
}

const APPEARANCES: AppearanceMode[] = ["system", "light", "dark"];

function appearanceItem(mode: AppearanceMode): MenuItem {
  return {
    label: appearanceName(mode),
    checked: appearanceMode() === mode,
    onSelect: () => chooseAppearance(mode),
  };
}

// The menu bar, top to bottom. Its items are built each time it is set, so their state is current.
function menuBar(): MenuItem[] {
  return [
    submenu("DiscoveryOS", [role("about"), SEPARATOR, role("hide"), role("hideOthers"), role("showAll"), SEPARATOR, role("quit")]),
    submenu("Edit", [role("undo"), role("redo"), SEPARATOR, role("cut"), role("copy"), role("paste"), role("selectAll")]),
    submenu("Forum", [item("forum.search"), item("forum.refresh"), SEPARATOR, item("forum.next"), item("forum.prev"), item("forum.compose")]),
    submenu("Thread", [
      item("thread.top"),
      item("thread.bottom"),
      SEPARATOR,
      item("thread.reply"),
      item("thread.favorite"),
      item("thread.quote"),
      item("reply.send"),
    ]),
    submenu("View", [submenu("Appearance", APPEARANCES.map(appearanceItem))]),
    submenu("Window", [role("minimize"), role("zoom"), role("toggleFullScreen"), SEPARATOR, role("close")]),
    submenu("Help", [item("forum.shortcuts"), ...(debugEnabled ? [SEPARATOR, ...debugItems()] : [])]),
  ];
}

// Debug (only with DEBUG=1): copy the forum session's cookies out, and import them back from the clipboard.
// The text is a live session credential: it is never logged or shown.
function debugItems(): MenuItem[] {
  return [
    { label: "Copy Session Cookies", onSelect: copySessionCookies },
    { label: "Import Session Cookies", onSelect: openCookieImport },
  ];
}

function copySessionCookies(): void {
  Clipboard.writeText(exportCookies());
}


/** Sets the menu bar, and sets it again whenever a command, its state or the appearance changes. Call once, from the app. */
export function installMenu(): void {
  if (!isAvailable) return;
  effect(() => {
    Menu.setApplicationMenu(menuBar());
  });
}
