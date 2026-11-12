import { createAnimatedValue, Image, mount, Overlay, signal, Text, View, type JSX, type ViewRef } from "nsh";
import { Input } from "nsh/base";
import { currentUser, login, logout, restoreSession } from "./src/discuz/client";
import { loadProfile } from "./src/discuz/forum";
import type { Profile } from "./src/discuz/parse";
import { clearCredentials, loadCredentials, saveCredentials } from "./src/discuz/credentials";
import { hasSavedCookies } from "./src/discuz/cookies";
import { Forum } from "./src/ui/Forum";
import { notify, Toaster } from "./src/ui/toast";
import { DownloadIcon, ThemeIcon } from "./src/ui/icons";
import { hint } from "./src/ui/Hint";
import { hideSystemTitleBar } from "./src/ui/TitleBar";
import { availableUpdate, installUpdate, startUpdateCheck } from "./src/update";
import { updateTitle } from "./src/updateManifest";
import { appearanceMode, appearanceName, cycleAppearance, palette, restoreAppearance, type AppearanceMode } from "./src/ui/appearance";
import { installMenu } from "./src/ui/commands";
import { CookieImportDialog, cookieImportOpen, setOnCookiesImported } from "./src/ui/CookieImport";
import { AboutDialog, aboutOpen } from "./src/ui/AboutDialog";
import { debugEnabled } from "./src/debugLog";

// Port of `LoginView` (`Views/MainView.swift`) and `CurrentUserStore`: the forum is
// shown to everyone; the session is restored on launch from the saved cookies, then
// the saved password. Signing in is a dialog opened from the account row.

// `secondary` is the quiet choice beside a primary one (Cancel): an outlined surface
// instead of the solid button color, so the primary action is the one that stands out.
function Button(props: { label: string; disabled?: boolean; secondary?: boolean; onPress: () => void }) {
  const secondary = props.secondary === true;
  return (
    <View
      onPress={props.disabled ? undefined : props.onPress}
      style={{
        backgroundColor: secondary ? palette().surface : props.disabled ? palette().buttonDisabled : palette().button,
        borderWidth: secondary ? 1 : 0,
        borderColor: palette().border,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: secondary ? palette().text : palette().buttonText,
          fontSize: 14,
        }}
      >
        {props.label}
      </Text>
    </View>
  );
}

// The account row's theme control.

function IconButton(props: { icon: JSX.Element; title: string; disabled?: boolean; onPress: () => void }) {
  return (
    <View
      onPress={props.disabled ? undefined : props.onPress}
      accessibilityLabel={props.title}
      tooltip={hint(props.title)}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
      }}
    >
      {props.icon}
    </View>
  );
}

// The account menu's profile rows, in order: the label, and the field it shows.
const MENU_ROWS: [string, keyof Profile][] = [
  ["Group", "group"],
  ["Registered", "registered"],
  ["Last visit", "lastVisit"],
  ["Last post", "lastPost"],
  ["Post level", "postLevel"],
  ["Read permission", "readPermission"],
  ["Posts", "posts"],
  ["Daily posts", "dailyPosts"],
  ["Essence", "essence"],
  ["Page views", "pageViews"],
  ["Online, total (h)", "onlineTotal"],
  ["Online, this month (h)", "onlineThisMonth"],
  ["Credits", "credits"],
  ["Prestige", "prestige"],
  ["Money", "money"],
];

function MenuRow(props: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ fontSize: 12, color: palette().muted }}>{props.label}</Text>
      <Text style={{ fontSize: 12, color: palette().text }}>{props.value}</Text>
    </View>
  );
}

// A row the account menu acts on: its label, lit with a tint while the pointer is over it.
function MenuAction(props: { label: string; onPress: () => void }) {
  const hover = createAnimatedValue(0);
  return (
    <View
      onPress={props.onPress}
      onMouseEnter={() => {
        hover.timing(1, { duration: 120 }).catch(() => undefined);
      }}
      onMouseLeave={() => {
        hover.timing(0, { duration: 120 }).catch(() => undefined);
      }}
      accessibilityLabel={props.label}
      style={{ paddingVertical: 6, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 6 }}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 6,
          backgroundColor: palette().border,
          opacity: hover.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }),
        }}
      />
      <Text style={{ fontSize: 13, color: palette().text }}>{props.label}</Text>
    </View>
  );
}

function App() {
  const user = signal<string | null>(currentUser());
  const name = signal("");
  const pass = signal("");
  const busy = signal(false);
  const avatar = signal<string | null>(null);
  // The sign-in dialog, opened from the blank avatar while signed out.
  const dialogOpen = signal(false);
  // The account menu, opened from the avatar while signed in: the profile's fields and sign-out.
  // `avatarNode` is the avatar's node: the menu's overlay is placed against it, and sits above the
  // whole window (a sibling column drawn later would otherwise cover a menu that is only absolute).
  const menuOpen = signal(false);
  const profile = signal<Profile | null>(null);
  const avatarNode = signal<ViewRef | null>(null);
  // The sign-out confirmation, opened from the menu's Sign Out.
  const confirmOpen = signal(false);

  function refreshProfile(name: string) {
    loadProfile(name)
      .then((p) => {
        avatar.set(p.avatar ?? null);
        profile.set(p);
      })
      .catch(() => {
        // No profile to show: the menu stops saying it is loading, and shows only Sign Out.
        avatar.set(null);
        profile.set({});
      });
  }

  function showProfile(name: string) {
    user.set(name);
    refreshProfile(name);
  }

  function openMenu() {
    menuOpen.set(true);
    refreshProfile(user() ?? "");
  }

  function closeMenu() {
    menuOpen.set(false);
  }

  async function signIn() {
    busy.set(true);
    try {
      const ok = await login(name(), pass());
      if (ok) {
        saveCredentials({ name: name(), pass: pass() });
        showProfile(name());
        pass.set("");
        dialogOpen.set(false);
      } else {
        notify("sign-in", "Sign-in failed.");
      }
    } catch (e) {
      notify("sign-in", `Sign-in failed: ${e}`);
    } finally {
      busy.set(false);
    }
  }

  async function signOut() {
    busy.set(true);
    try {
      await logout();
    } catch {
      // The local session ends either way; the server's answer is not needed.
    }
    clearCredentials();
    avatar.set(null);
    profile.set(null);
    menuOpen.set(false);
    user.set(null);
    name.set("");
    pass.set("");
    busy.set(false);
  }

  restoreAppearance();
  installMenu();

  // Restores the session: the saved cookies first, then the saved password. Only a
  // refused password clears what is saved. With nothing saved, or a login that no
  // longer works, the sign-in dialog opens. Runs on launch and after a cookie import.
  function restoreLogin() {
    const saved = loadCredentials();
    busy.set(true);
    restoreSession(saved)
      .then((state) => {
        if (state === "signed-in") {
          // The same completion as a sign-in: the profile shows and the sign-in dialog closes.
          showProfile(currentUser() ?? saved?.name ?? "");
          dialogOpen.set(false);
        }
        else if (state === "signed-out") {
          if (saved) clearCredentials();
          dialogOpen.set(true);
        } else if (state === "offline") notify("restore", "Offline: the saved login is kept.");
      })
      .catch((e) => notify("restore", `Could not restore the login: ${e}`))
      .finally(() => busy.set(false));
  }

  // Debug: an import of cookies signs in with them at once.
  setOnCookiesImported(restoreLogin);

  if (loadCredentials() || hasSavedCookies()) {
    restoreLogin();
  } else {
    dialogOpen.set(true);
  }

  // The account menu, above the avatar: the signed-in user's profile fields, then Sign Out.
  // Fields the page lacks are left out; until the profile arrives the menu says it is loading.
  const accountMenu = (): JSX.Element => {
    const p = profile();
    return (
      <View
        style={{
          width: 240,
          padding: 12,
          gap: 6,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette().border,
          backgroundColor: palette().surface,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: 600, color: palette().text }}>{user() ?? ""}</Text>
        {p ? (
          <Each
            of={MENU_ROWS.flatMap(([label, key]) => {
              const value = p[key];
              return value ? [{ label, value }] : [];
            })}
            key={(row: { label: string; value: string }) => row.label}
          >
            {(row) => <MenuRow label={row().label} value={row().value} />}
          </Each>
        ) : (
          <Text style={{ fontSize: 12, color: palette().muted }}>Loading…</Text>
        )}
        <View style={{ height: 1, backgroundColor: palette().border, marginVertical: 4 }} />
        <MenuAction
          label="Sign Out"
          onPress={() => {
            closeMenu();
            confirmOpen.set(true);
          }}
        />
      </View>
    );
  };

  // An update the user can apply now; a downloaded one also applies at the next start.
  const applyUpdate = () => {
    const manifest = availableUpdate();
    if (!manifest) return;
    notify("update", `正在更新到 ${manifest.version}…`);
    installUpdate(manifest)
      .then((result) => {
        if (result.startsWith("err")) notify("update", "更新失败，请稍后再试");
      })
      .catch(() => notify("update", "更新失败，请稍后再试"));
  };

  // The account row and its controls sit at the bottom of the channel column,
  // as the Claude Code sidebar keeps its account at the bottom left. Signed out,
  // the row is a blank avatar that opens the sign-in dialog.
  // `compact` is the channel rail's width: the avatar, theme and sign-out stack in a column.
  const accountFooter = (compact: boolean): JSX.Element => (
    <View style={{ borderTopWidth: 1, borderColor: palette().border }}>
      <View style={{ padding: compact ? 6 : 10, flexDirection: compact ? "column" : "row", alignItems: "center", gap: 8 }}>
        {user() ? (
          <>
            {/* The avatar opens the account menu; the menu closes on a press outside it. */}
            <View
              ref={(n: ViewRef | null) => avatarNode.set(n)}
              onPress={menuOpen() ? undefined : openMenu}
              accessibilityLabel="Account menu"
            >
              {avatar() ? (
                <Image src={avatar()!} style={{ width: 24, height: 24, borderRadius: 12 }} />
              ) : (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: palette().border,
                    backgroundColor: palette().surface,
                  }}
                />
              )}
            </View>
            {/* An overlay, not an absolute view: it draws above the whole window, not just this column. */}
            {menuOpen() && avatarNode() ? (
              <Overlay anchor={avatarNode()} placement="top" align="start" offset={8} onPressOutside={closeMenu}>
                {accountMenu()}
              </Overlay>
            ) : null}
          </>
        ) : (
          <View
            onPress={() => dialogOpen.set(true)}
            accessibilityLabel="Sign in"
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: palette().border,
              backgroundColor: palette().surface,
            }}
          />
        )}
        {compact ? null : user() ? (
          <Text style={{ fontSize: 13, color: palette().text, flex: 1 }}>{user()!}</Text>
        ) : (
          // Signed out, the name's place reads "Sign in" and opens the same dialog as the avatar.
          <View onPress={() => dialogOpen.set(true)} accessibilityLabel="Sign in" style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: palette().text }}>Sign in</Text>
          </View>
        )}
        {availableUpdate() ? (
          <IconButton
            icon={<DownloadIcon size={18} />}
            title={updateTitle(availableUpdate()!)}
            onPress={applyUpdate}
          />
        ) : null}
        <IconButton icon={<ThemeIcon size={16} mode={appearanceMode} />} title={`Theme: ${appearanceName(appearanceMode())}`} onPress={cycleAppearance} />
      </View>
    </View>
  );

  // The sign-in dialog: a panel over the forum, with Cancel and Sign in.
  const signInDialog: JSX.Element = (
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
        style={{
          width: 280,
          padding: 16,
          gap: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette().border,
          backgroundColor: palette().surface,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: 600, color: palette().text }}>Account</Text>
        <Input
          placeholder="Username"
          value={name()}
          onChange={({ value: text }: { value: string }) => name.set(text)}
          style={{ height: 28, paddingHorizontal: 8, fontSize: 14 }}
        />
        <Input
          placeholder="Password"
          masked={true}
          value={pass()}
          onChange={({ value: text }: { value: string }) => pass.set(text)}
          // Return in the password field signs in, like the default button in the Swift sheet.
          onSubmit={() => {
            if (!busy() && name().length > 0 && pass().length > 0) void signIn();
          }}
          style={{ height: 28, paddingHorizontal: 8, fontSize: 14 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Button label="Cancel" secondary={true} onPress={() => dialogOpen.set(false)} />
          <Button
            label={busy() ? "Signing in…" : "Sign in"}
            disabled={busy() || name().length === 0 || pass().length === 0}
            onPress={signIn}
          />
        </View>
      </View>
    </View>
  );

  // The sign-out confirmation: a panel over the forum, with Cancel and Sign Out.
  const signOutDialog: JSX.Element = (
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
        style={{
          width: 280,
          padding: 16,
          gap: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette().border,
          backgroundColor: palette().surface,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: 600, color: palette().text }}>Sign out?</Text>
        <Text style={{ fontSize: 13, color: palette().text }}>{`Sign out of ${user() ?? "this account"}?`}</Text>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Button label="Cancel" secondary={true} onPress={() => confirmOpen.set(false)} />
          <Button
            label={busy() ? "Signing out…" : "Sign Out"}
            disabled={busy()}
            onPress={() => {
              confirmOpen.set(false);
              signOut();
            }}
          />
        </View>
      </View>
    </View>
  );

  // The whole main interface is one selectable view, so every text in it can be selected,
  // including text inside rows and buttons that take presses.
  return (
    <View
      selectable={true}
      style={{
        flex: 1,
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        alignItems: "stretch",
        justifyContent: "flex-start",
        backgroundColor: palette().bg,
      }}
    >
      <View style={{ flex: 1, alignSelf: "stretch" }}>
        <Forum user={user} footer={(compact) => accountFooter(compact)} onSignInNeeded={() => dialogOpen.set(true)} />
      </View>
      {dialogOpen() ? signInDialog : null}
      {confirmOpen() ? signOutDialog : null}
      {debugEnabled && cookieImportOpen() ? <CookieImportDialog /> : null}
      {aboutOpen() ? <AboutDialog /> : null}
      <Toaster />

    </View>
  );
}

hideSystemTitleBar();
mount(App);
startUpdateCheck();
