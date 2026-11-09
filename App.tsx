import { Image, mount, signal, Text, View, type JSX } from "nsh";
import { Input } from "nsh/base";
import { currentUser, login, logout, restoreSession } from "./src/discuz/client";
import { loadUser } from "./src/discuz/forum";
import { clearCredentials, loadCredentials, saveCredentials } from "./src/discuz/credentials";
import { hasSavedCookies } from "./src/discuz/cookies";
import { Forum } from "./src/ui/Forum";
import { Toaster } from "./src/ui/toast";
import { appearanceMode, appearanceName, cycleAppearance, palette, restoreAppearance, type AppearanceMode } from "./src/ui/appearance";

// Port of `LoginView` (`Views/MainView.swift`) and `CurrentUserStore`: the forum is
// shown to everyone; the session is restored on launch from the saved cookies, then
// the saved password. Signing in is a dialog opened from the account row.

function Button(props: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <View
      onPress={props.disabled ? undefined : props.onPress}
      style={{
        backgroundColor: props.disabled ? palette().buttonDisabled : palette().button,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: "center",
      }}
    >
      <Text style={{ color: palette().buttonText, fontSize: 14 }}>{props.label}</Text>
    </View>
  );
}

// The account row's icons: the theme's current setting, and the sign-out symbol.
const THEME_ICON: Record<AppearanceMode, string> = { system: "◐", light: "☀", dark: "☾" };

function IconButton(props: { label: string; title: string; disabled?: boolean; onPress: () => void }) {
  return (
    <View
      onPress={props.disabled ? undefined : props.onPress}
      accessibilityLabel={props.title}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
      }}
    >
      <Text style={{ color: props.disabled ? palette().muted : palette().text, fontSize: 16 }}>{props.label}</Text>
    </View>
  );
}

function App() {
  const user = signal<string | null>(currentUser());
  const name = signal("");
  const pass = signal("");
  const busy = signal(false);
  const error = signal<string | null>(null);
  const avatar = signal<string | null>(null);
  // The sign-in dialog, opened from the blank avatar while signed out.
  const dialogOpen = signal(false);
  const dialogError = signal<string | null>(null);

  function showProfile(name: string) {
    user.set(name);
    loadUser(name)
      .then((u) => avatar.set(u?.avatar ?? null))
      .catch(() => avatar.set(null));
  }

  async function signIn() {
    busy.set(true);
    dialogError.set(null);
    try {
      const ok = await login(name(), pass());
      if (ok) {
        saveCredentials({ name: name(), pass: pass() });
        showProfile(name());
        pass.set("");
        dialogOpen.set(false);
      } else {
        dialogError.set("Sign-in failed");
      }
    } catch (e) {
      dialogError.set(`Sign-in failed: ${e}`);
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
    user.set(null);
    name.set("");
    pass.set("");
    busy.set(false);
  }

  restoreAppearance();

  // Restore the session once, on launch: the saved cookies first, then the
  // saved password. Only a refused password clears what is saved.
  const saved = loadCredentials();
  if (saved || hasSavedCookies()) {
    busy.set(true);
    restoreSession(saved)
      .then((state) => {
        if (state === "signed-in") showProfile(currentUser() ?? saved?.name ?? "");
        else if (state === "signed-out" && saved) clearCredentials();
        else if (state === "offline") error.set("Offline: the saved login is kept");
      })
      .catch((e) => error.set(`Could not restore the login: ${e}`))
      .finally(() => busy.set(false));
  }

  // The account row and its controls sit at the bottom of the channel column,
  // as the Claude Code sidebar keeps its account at the bottom left. Signed out,
  // the row is a blank avatar that opens the sign-in dialog.
  // `compact` is the channel rail's width: the avatar, theme and sign-out stack in a column.
  const accountFooter = (compact: boolean): JSX.Element => (
    <View style={{ borderTopWidth: 1, borderColor: palette().border }}>
      {!compact && error() ? <Text style={{ fontSize: 12, color: palette().danger, padding: 8 }}>{error()}</Text> : null}
      <View style={{ padding: compact ? 6 : 10, flexDirection: compact ? "column" : "row", alignItems: "center", gap: 8 }}>
        {user() ? (
          avatar() ? <Image src={avatar()!} style={{ width: 24, height: 24, borderRadius: 12 }} /> : null
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
        {compact ? null : <Text style={{ fontSize: 13, color: palette().text, flex: 1 }}>{user() ?? ""}</Text>}
        <IconButton label={THEME_ICON[appearanceMode()]} title={`Theme: ${appearanceName(appearanceMode())}`} onPress={cycleAppearance} />
        {user() ? <IconButton label="⏻" title="Sign Out" disabled={busy()} onPress={signOut} /> : null}
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
          onChange={(text: string) => name.set(text)}
          style={{ height: 28, paddingHorizontal: 8, fontSize: 14 }}
        />
        <Input
          placeholder="Password"
          masked={true}
          value={pass()}
          onChange={(text: string) => pass.set(text)}
          style={{ height: 28, paddingHorizontal: 8, fontSize: 14 }}
        />
        {dialogError() ? <Text style={{ fontSize: 13, color: palette().danger }}>{dialogError()}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Button label="Cancel" onPress={() => dialogOpen.set(false)} />
          <Button
            label={busy() ? "Signing in…" : "Sign in"}
            disabled={busy() || name().length === 0 || pass().length === 0}
            onPress={signIn}
          />
        </View>
      </View>
    </View>
  );

  return (
    <View
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
        <Forum user={user} footer={(compact) => accountFooter(compact)} />
      </View>
      {dialogOpen() ? signInDialog : null}
      <Toaster />

    </View>
  );
}

mount(App);
