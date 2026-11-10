// The window's title bar, drawn by the app as Spotish's is: the system's is hidden
// at launch (`hideSystemTitleBar`), and the bar runs across the top of the window with the
// sidebar toggle at the left and search and close at the right. Where the platform draws
// none (the web, phones, full screen), `titleBarShown` is false and the forum's column
// headers hold these controls instead.
import { cleanup, effect, LayoutAnimation, Overlay, reduceMotion, signal, Text, untracked, View, type YNode } from "nsh";
import { Input } from "nsh/base";
import { hint } from "./Hint";
import { isAvailable, titleBar, Window } from "nsh/desktop";
import { palette } from "./appearance";
import { onEscape } from "./escape";
import { channelsCollapsed, toggleChannelsCollapsed } from "./channelRail";
import { SearchIcon, SidebarIcon } from "./icons";

/** Hides the system's title bar, so the app draws its own (`TitleBar`). Call once at launch. */
export function hideSystemTitleBar(): void {
  if (isAvailable) Window.setTitleBar("hidden", 44);
}

/** Fades the next change of the search field: 240 ms, opacity only, so nothing slides or moves while the
 * field and icon come and go; unless the system asks for reduced motion. Call it before the change. */
export function animateSearchChange(): void {
  if (reduceMotion()) return;
  const curve = { type: "easeInEaseOut" as const };
  LayoutAnimation.configureNext({
    duration: 240,
    update: { ...curve, property: "opacity" },
    create: { ...curve, property: "opacity" },
    delete: { ...curve, property: "opacity" },
  });
}

/** Whether the app draws the title bar: a desktop whose window hides its own. */
export function titleBarShown(): boolean {
  return isAvailable && titleBar().height > 0;
}

/** What the search control shows and does: the field when open, else its icon (signed in only). */
export type SearchProps = {
  open: () => boolean;
  draft: () => string;
  signedIn: () => boolean;
  onDraft: (text: string) => void;
  onSubmit: (term: string) => void;
  onOpen: () => void;
  /** Hides the field on a press outside it; the search and its results stay. */
  onHide: () => void;
  onClose: () => void;
  /** Counts up each time the field should take the focus (the `/` shortcut); the field focuses on a change. */
  focusTick?: () => number;
  /** The search the threads show ("" for none): beside the icon while the field is closed. */
  term: () => string;
};

function Glyph(props: { label: string; title: string; onPress: () => void; size?: number }) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={props.title}
      tooltip={hint("关闭搜索 (Esc)")}
      style={{ width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: palette().muted, fontSize: props.size ?? 22 }}>{props.label}</Text>
    </View>
  );
}

/** The search field, opened from its icon: Return searches, ✕ closes it. */
export function SearchControl(props: SearchProps) {
  // The field's place, which the outside-press overlay is anchored to.
  const field = signal<YNode | null>(null);
  // The input's handle, focused when `focusTick` changes (after the field has been shown).
  const input = signal<YNode | null>(null);
  // Whether the input has the keyboard focus (Escape then closes the field).
  const focused = signal(false);
  // The field is shown after a render, so its focus waits a turn.
  const focusSoon = () => setTimeout(() => input()?.focus(), 0);
  const openAndFocus = () => {
    props.onOpen();
    focusSoon();
  };
  let lastTick = 0;
  effect(() => {
    const tick = props.focusTick?.() ?? 0;
    untracked(() => {
      if (tick === lastTick) return;
      lastTick = tick;
      focusSoon();
    });
  });
  // Escape in the focused field hides it, as a press outside does: the search stays, shown
  // beside the icon, and the field loses the focus.
  cleanup(
    onEscape(() => {
      if (!focused() || !props.open()) return false;
      props.onHide();
      return true;
    }),
  );
  // Components run once, so the field and the icon switch inside JSX, not by an early return.
  return (
    <>
      {/* The icon comes first and keeps its place: it collapses at once when the field opens (width and
       * padding are not animated, only opacity is), and comes back where it was when the field closes. */}
      {props.signedIn() ? (
        <View
          onPress={props.open() ? undefined : openAndFocus}
          accessibilityLabel="Search threads"
          tooltip={hint("搜索帖子 (/)")}
          style={
            props.open()
              ? { width: 0, padding: 0, opacity: 0, overflow: "hidden" }
              : { padding: 4, borderRadius: 6, opacity: 1, flexDirection: "row", alignItems: "center", gap: 6 }
          }
        >
          <SearchIcon size={16} />
          {/* Closed, the search the threads show stays beside the icon; a press on either reopens the field. */}
          {!props.open() && props.term().length > 0 ? (
            <Text numberOfLines={1} style={{ fontSize: 13, color: palette().text, maxWidth: 200 }}>
              {props.term()}
            </Text>
          ) : null}
        </View>
      ) : null}
      {props.open() ? (
        <View
          ref={(n) => field.set(n)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            height: 32,
            // The icon's left edge matches the closed icon's: 1px border + 3px padding = its 4px inset.
            paddingLeft: 3,
            paddingRight: 2,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette().border,
            backgroundColor: palette().surface,
          }}
        >
          <SearchIcon size={16} />
          <Input
            ref={(n: YNode | null) => input.set(n)}
            onFocus={() => focused.set(true)}
            onBlur={() => {
              // Losing the focus (to the reply box, a click elsewhere) hides the field, as Escape does.
              focused.set(false);
              if (props.open()) props.onHide();
            }}
            placeholder="Search threads"
            value={props.draft()}
            onChange={(text: string) => props.onDraft(text)}
            onSubmit={({ text }: { text: string }) => props.onSubmit(text)}
            returnKeyType="search"
            accessibilityLabel="Search threads"
            style={{ flex: 1, height: 26, fontSize: 13, borderWidth: 0, backgroundColor: "transparent" }}
          />
          <Glyph label="✕" title="Close search" onPress={props.onClose} size={13} />
        </View>
      ) : null}
      {/* A press anywhere outside the field hides it. Presses still reach what is under them. */}
      {props.open() && field() ? (
        <Overlay anchor={field()} onPressOutside={props.onHide}>
          <View style={{ width: 0, height: 0 }} />
        </Overlay>
      ) : null}
    </>
  );
}

/** The title bar: it drags the window (double-click maximizes, as the system's does). */
export function TitleBar(props: { wide: () => boolean; search: SearchProps }) {
  return (
    <View
      desktop={{ windowDrag: true }}
      style={{
        height: titleBar().height,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: titleBar().left + 14,
        paddingRight: titleBar().right + 14,
      }}
    >
      {props.wide() ? (
        <View
          onPress={toggleChannelsCollapsed}
          accessibilityLabel={channelsCollapsed() ? "Expand channels" : "Collapse channels"}
          tooltip={hint(channelsCollapsed() ? "展开版块" : "收起版块")}
          style={{ padding: 4, borderRadius: 6 }}
        >
          <SidebarIcon size={16} />
        </View>
      ) : null}
      {/* The search sits after the sidebar toggle; its field grows from the icon's place. */}
      <View style={{ flexDirection: "row", width: props.search.open() ? 280 : undefined }}>
        <SearchControl {...props.search} />
      </View>
      <View style={{ flex: 1 }} />
    </View>
  );
}
