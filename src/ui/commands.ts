// The app's commands: one catalog of their titles, keys and menu places, the behaviour each view
// gives them while it is shown, and the menu bar and shortcut list built from both. A key that
// types (`/`, `n`, `r`) is bound through the keymap and is left out of the native menu's shortcut
// field, so the menu cannot fire it while a text field has the focus; chords with a modifier
// (`mod+r`) are bound the same way, so every shortcut has one path.
import { Clipboard, cleanup, effect, keymap, platform, signal, untracked } from "nsh";
import { isAvailable, Menu, type MenuItem, type MenuRole } from "nsh/desktop";
import { openAbout } from "./AboutDialog";
import { debugEnabled } from "../debugLog";
import { exportCookies } from "../discuz/cookies";
import { appearanceMode, appearanceName, chooseAppearance, type AppearanceMode } from "./appearance";
import { openCookieImport } from "./CookieImport";
import { checkForUpdateNow, checkingUpdate } from "../update";

export type CommandId =
  | "forum.search"
  | "forum.refresh"
  | "forum.next"
  | "forum.prev"
  | "forum.compose"
  | "forum.shortcuts"
  | "forum.toggleChannels"
  | "thread.top"
  | "thread.bottom"
  | "thread.reply"
  | "thread.favorite"
  | "thread.quote"
  | "thread.edit"
  | "thread.react1"
  | "thread.react2"
  | "thread.react3"
  | "thread.react4"
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
  "forum.search": { title: "搜索帖子", keys: ["/", "mod+f"], order: 10 },
  "forum.refresh": { title: "刷新", keys: ["mod+r"], order: 20 },
  "forum.next": { title: "下一个帖子", keys: ["n"], order: 30 },
  "forum.prev": { title: "上一个帖子", keys: ["p"], order: 40 },
  "forum.compose": { title: "发新帖", keys: ["c"], order: 50 },
  "forum.shortcuts": { title: "键盘快捷键", keys: ["shift+/"], hint: "?", order: 60 },
  "forum.toggleChannels": { title: "显示或隐藏板块栏", keys: ["mod+b"], order: 15 },
  "thread.top": { title: "跳到回复顶部", hint: "g g", order: 100 },
  "thread.bottom": { title: "跳到回复底部", keys: ["shift+g"], hint: "G", order: 110 },
  "thread.reply": { title: "回复", keys: ["r"], order: 120 },
  "thread.favorite": { title: "收藏帖子", keys: ["f"], order: 130 },
  "thread.quote": { title: "引用高亮的回复", keys: ["q"], order: 140 },
  "thread.edit": { title: "编辑高亮的回复", keys: ["e"], order: 145 },
  "thread.react1": { title: "用快捷表情 1 回应", keys: ["1"], order: 141 },
  "thread.react2": { title: "用快捷表情 2 回应", keys: ["2"], order: 142 },
  "thread.react3": { title: "用快捷表情 3 回应", keys: ["3"], order: 143 },
  "thread.react4": { title: "用快捷表情 4 回应", keys: ["4"], order: 144 },
  "reply.send": { title: "发送回复", keys: ["mod+enter"], order: 150 },
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
  return [...rows, { key: "Esc", action: "关闭此列表或搜索框" }];
}

const SEPARATOR: MenuItem = { type: "separator" };

function role(name: MenuRole): MenuItem {
  return { role: name };
}

// About opens the app's own dialog (build details, last check) on every platform.
function aboutItem(): MenuItem {
  return { label: "关于 DiscoveryOS", onSelect: openAbout };
}

// Checks for a newer build now; greyed while a check is running. Reading the signal here makes the menu rebuild when it changes.
function checkUpdateItem(): MenuItem {
  return { label: "检查更新…", disabled: checkingUpdate(), onSelect: () => void checkForUpdateNow() };
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

// The app menu. Hide / Hide Others / Show All are macOS roles only; showing them as dead items
// on Windows and Linux makes the menus look broken there.
function appMenuItems(): MenuItem[] {
  const macOnly: MenuItem[] =
    platform.os === "macos" ? [role("hide"), role("hideOthers"), role("showAll"), SEPARATOR] : [];
  return [aboutItem(), checkUpdateItem(), SEPARATOR, ...macOnly, role("quit")];
}

// The menu bar, top to bottom. Its items are built each time it is set, so their state is current.
export function menuBar(): MenuItem[] {
  return [
    submenu("DiscoveryOS", appMenuItems()),
    submenu("编辑", [role("undo"), role("redo"), SEPARATOR, role("cut"), role("copy"), role("paste"), role("selectAll")]),
    submenu("论坛", [item("forum.search"), item("forum.refresh"), SEPARATOR, item("forum.next"), item("forum.prev"), item("forum.compose")]),
    submenu("帖子", [
      item("thread.top"),
      item("thread.bottom"),
      SEPARATOR,
      item("thread.reply"),
      item("thread.favorite"),
      item("thread.quote"),
      item("thread.edit"),
      item("reply.send"),
    ]),
    submenu("视图", [submenu("外观", APPEARANCES.map(appearanceItem))]),
    submenu("窗口", [role("minimize"), role("zoom"), role("toggleFullScreen"), SEPARATOR, role("close")]),
    submenu("帮助", [aboutItem(), SEPARATOR, item("forum.shortcuts"), ...(debugEnabled ? [SEPARATOR, ...debugItems()] : [])]),
  ];
}

// Debug (only with DISCO_DEBUG set): copy the forum session's cookies out, and import them back from the clipboard.
// The text is a live session credential: it is never logged or shown.
function debugItems(): MenuItem[] {
  return [
    { label: "复制会话 Cookie", onSelect: copySessionCookies },
    { label: "导入会话 Cookie", onSelect: openCookieImport },
  ];
}

function copySessionCookies(): void {
  Clipboard.writeText(exportCookies());
}


/** Opens the app's menus as a popup. Windows and Linux hide the window's menu bar while the app
 * draws its title bar, so the title bar's Menu button (or F10) opens the same menus this way. */
export function openAppMenu(): void {
  if (!isAvailable) return;
  void Menu.popup(menuBar()).catch(() => undefined);
}

/** Sets the menu bar, and sets it again whenever a command, its state or the appearance changes. Call once, from the app. */
export function installMenu(): void {
  if (!isAvailable) return;
  effect(() => {
    Menu.setApplicationMenu(menuBar());
  });
  // With no system menu bar on Windows and Linux, F10 opens the menus as it would on a window
  // that has one: a way in even when the app's title bar (and its Menu button) is not drawn.
  if (platform.os !== "macos") {
    keymap.bind("f10", openAppMenu, { when: "always" });
  }
}
