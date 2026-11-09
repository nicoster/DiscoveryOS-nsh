// The signed-in screens in three columns, as the Swift app's split view:
// channels | a channel's threads (or favorites) | the open thread.
// Components run once, so the views switch inside JSX, not by early return.
import { effect, LayoutAnimation, reduceMotion, Scroll, signal, Text, untracked, View, windowSize, type JSX } from "nsh";
import { loadBookmarks, loadChannels, loadPosts } from "../discuz/forum";
import { avatarPicture, userAvatar } from "../discuz/avatarCache";
import { mergePage, type Channel, type Post } from "../discuz/parse";
import { dbg } from "../debugConsole";
import { Thread } from "./Thread";
import { nearEnd } from "./nearEnd";
import { LoadingBar } from "./LoadingBar";
import { channelIcon } from "./channelIcon";
import { RefreshIcon, SidebarIcon } from "./icons";
import { palette } from "./appearance";
import { loadLastPlace, saveLastPlace } from "./lastPlace";
import { Failure } from "./Failure";
import { ThreadSkeleton } from "./Skeleton";
import { ThreadRow } from "./ThreadRow";
import { channelsCollapsed, channelsRailed, FULL_WIDTH, RAIL_BELOW, RAIL_WIDTH, toggleChannelsCollapsed } from "./channelRail";

// The name whose avatar a row shows: a channel's thread author. Favorites rows
// carry no author, so they show the last replier's avatar instead.
function avatarName(p: Post): string | undefined {
  return p.author ?? p.lastReplyBy;
}

/** A failed load: what to say, and what Retry does. */
interface Failed {
  message: string;
  retry: () => void;
}

// The first page of each list as it last loaded, keyed by list. Opening a list again
// shows it at once while its refresh runs. Cleared on sign-out: an account sees more.
const FAVORITES_KEY = "favorites";
const forumKey = (fid: string) => `forum:${fid}`;

// `user` is the signed-in name, or null. The forum lists channels and threads for
// everyone; signing in or out reloads the channel list, since an account sees more.
export function Forum(props: { footer?: (compact: boolean) => JSX.Element; user: () => string | null }) {
  const channels = signal<Channel[] | null>(null);
  const channel = signal<Channel | null>(null);
  const favorites = signal(false);
  const thread = signal<Post | null>(null);
  const posts = signal<Post[]>([]);
  const page = signal(1);
  const more = signal(false);
  const error = signal<Failed | null>(null);
  // Author avatars for the thread rows, looked up once per author.
  const avatars = signal<Record<string, string>>({});
  const asked = new Set<string>();
  const listCache = new Map<string, { items: Post[]; more: boolean }>();
  // A list opened without a cached copy comes in as a wave once its first page arrives.
  // `waveDue` is set by the open and spent by that page; `animateRows` is what the rows
  // read when they are made, and drops after the wave so later rows come in plainly.
  let waveDue = false;
  const animateRows = signal(false);
  const WAVE_MS = 1500;

  // The place saved by the last run, read once; it is applied once, after the
  // channel list first loads, and only if the user has not picked a place since.
  const savedPlace = loadLastPlace();
  let placeRestored = false;

  // The channel column: a rail of icons when folded or when the window is narrow.
  const railed = () => channelsRailed(windowSize().width, channelsCollapsed());
  const wide = () => windowSize().width >= RAIL_BELOW;

  // The channel column glides between its full width and the rail when the arrangement
  // changes: the user folds it, or the window crosses the breakpoint. A window dragged
  // within one arrangement follows the pointer at once, so it does not animate.
  let lastRailed: boolean | null = null;
  effect(() => {
    const now = railed();
    untracked(() => {
      if (lastRailed !== null && now !== lastRailed && !reduceMotion()) {
        // 240 ms, the duration Spotish uses for a layout change (`DURATION.base`).
        const curve = { type: "easeInEaseOut" as const };
        LayoutAnimation.configureNext({
          duration: 240,
          update: curve,
          create: { ...curve, property: "opacity" },
          delete: { ...curve, property: "opacity" },
        });
      }
      lastRailed = now;
    });
  });

  // Saves the channel and thread now open (favorites save no channel).
  function savePlace() {
    saveLastPlace({ channel: favorites() ? null : channel(), thread: thread() });
  }

  function restorePlace(list: Channel[]) {
    if (placeRestored) return;
    placeRestored = true;
    savedPlace.then((place) => {
      const saved = place?.channel;
      if (!saved || favorites() || channel()) return;
      const found = list.find((c) => c.id === saved.id);
      if (!found) return;
      openChannel(found);
      if (place?.thread) {
        thread.set(place.thread);
        savePlace();
      }
    });
  }

  function loadAvatars(list: Post[]) {
    for (const p of list) {
      const name = avatarName(p);
      if (!name || asked.has(name)) continue;
      asked.add(name);
      userAvatar(name)
        .then((url) => (url ? avatarPicture(url) : undefined))
        .then((picture) => {
          if (picture) avatars.set({ ...avatars(), [name]: picture });
        })
        .catch(() => undefined);
    }
  }

  let loadingMore = false;
  const loadingMoreShown = signal(false);
  // A page after the first that fails is retried by the next scroll to the end. Only after
  // MORE_FAILURES in a row does the list's end show the failure with a Retry button.
  const MORE_FAILURES = 3;
  let moreFailures = 0;
  const moreError = signal<Failed | null>(null);
  // The first page of a channel or of favorites is loading and nothing is cached for it:
  // the column shows placeholder rows in place of the list. `listRequest` drops answers
  // that were overtaken by a later pick.
  const listLoading = signal(false);
  // True while page 1 of the open list is fetched, cached or not: the refresh icon spins.
  const refreshing = signal(false);
  let listRequest = 0;

  // Loads page `n` of a list (a channel's threads or the favorites) and merges it in;
  // page 1 replaces the list and is cached under `key`.
  function fetchList(load: (n: number) => Promise<Post[]>, n: number, key: string) {
    const request = n === 1 ? ++listRequest : listRequest;
    if (n === 1) refreshing.set(true);
    load(n)
      .then((list) => {
        if (request !== listRequest) return;
        moreFailures = 0;
        moreError.set(null);
        const merged = n === 1 ? { items: list, more: list.length > 0 } : mergePage(posts(), list);
        more.set(merged.more);
        if (n === 1) {
          animateRows.set(waveDue);
          if (waveDue) setTimeout(() => animateRows.set(false), WAVE_MS);
          waveDue = false;
        }
        posts.set(merged.items);
        if (n === 1) listCache.set(key, { items: merged.items, more: merged.more });
        loadAvatars(list);
        page.set(n);
      })
      .catch((e) => {
        if (request !== listRequest) return;
        dbg("threads failed", key, "page", n, String(e));
        if (n === 1) {
          error.set({
            message: "Couldn't load threads.",
            retry: () => {
              error.set(null);
              listLoading.set(true);
              fetchList(load, 1, key);
            },
          });
          return;
        }
        moreFailures++;
        if (moreFailures >= MORE_FAILURES) {
          moreError.set({
            message: "Couldn't load more threads.",
            retry: () => {
              moreError.set(null);
              moreFailures = 0;
              loadMore();
            },
          });
        }
      })
      .finally(() => {
        loadingMore = false;
        loadingMoreShown.set(false);
        if (request === listRequest) listLoading.set(false);
        if (n === 1 && request === listRequest) refreshing.set(false);
      });
  }

  function loadMore() {
    // Once the end shows Retry, scrolling does not fetch again: the button does.
    if (loadingMore || !more() || moreError()) return;
    // Favorites page the same way as a channel: the next page of the favorites.
    if (favorites()) {
      loadingMore = true;
      loadingMoreShown.set(true);
      fetchList((p) => loadBookmarks(p), page() + 1, FAVORITES_KEY);
    } else if (channel()) {
      const c = channel()!;
      loadingMore = true;
      loadingMoreShown.set(true);
      fetchList((p) => loadPosts(c.id, p), page() + 1, forumKey(c.id));
    }
  }

  // Opens a list: from the cache at once when it is there, placeholder rows otherwise;
  // either way its first page is fetched and replaces what is shown.
  function openList(key: string, load: (n: number) => Promise<Post[]>) {
    const cached = listCache.get(key);
    waveDue = !cached;
    posts.set(cached ? cached.items : []);
    more.set(cached ? cached.more : true);
    page.set(1);
    error.set(null);
    moreFailures = 0;
    moreError.set(null);
    listLoading.set(!cached);
    fetchList(load, 1, key);
  }

  function showFavorites() {
    favorites.set(true);
    channel.set(null);
    thread.set(null);
    openList(FAVORITES_KEY, (p) => loadBookmarks(p));
    savePlace();
  }

  function openChannel(c: Channel) {
    favorites.set(false);
    channel.set(c);
    thread.set(null);
    openList(forumKey(c.id), (p) => loadPosts(c.id, p));
    savePlace();
  }

  function openThread(p: Post) {
    thread.set(p);
    savePlace();
  }

  // True while the channel list is being fetched: the refresh icon dims and ignores presses.
  const channelsLoading = signal(false);

  // Only the newest request may set the list, so an earlier answer cannot
  // replace a later one (a signed-out load finishing after a signed-in one).
  let channelsRequest = 0;

  // `quiet` drops a failure silently: after sign-out, the channel list may refuse
  // the signed-out view, and that is expected rather than an error to show.
  function reloadChannels(quiet = false) {
    if (channelsLoading()) return;
    channelsLoading.set(true);
    const request = ++channelsRequest;
    loadChannels()
      .then((list) => {
        if (request !== channelsRequest) return;
        channels.set(list);
        restorePlace(list);
      })
      .catch((e) => {
        if (request !== channelsRequest || quiet) return;
        dbg("channels failed", String(e));
        error.set({ message: "Couldn't load channels.", retry: () => reloadChannels() });
      })
      .finally(() => {
        if (request === channelsRequest) channelsLoading.set(false);
      });
  }

  // Refresh the open list: favorites or the channel's threads, from page 1.
  function refreshThreads() {
    if (favorites()) showFavorites();
    else if (channel()) openChannel(channel()!);
  }

  // Load the channel list on launch, and again on every sign-in or sign-out. Signing
  // out closes the open list and thread: a hidden channel, or favorites, needs an
  // account, so its threads must not stay on screen. A list still loading is dropped.
  // Whether the previous run saw a signed-in user: null on launch, so only a real sign-out is quiet.
  const wasSignedIn = signal<boolean | null>(null);
  effect(() => {
    const signedIn = !!props.user();
    untracked(() => {
      if (!signedIn) {
        listRequest++;
        // Cached lists are per account: they go with the sign-out.
        listCache.clear();
        // The signed-in channel list goes too: the reload below brings the signed-out one.
        channels.set(null);
        favorites.set(false);
        channel.set(null);
        thread.set(null);
        posts.set([]);
        page.set(1);
        more.set(false);
        listLoading.set(false);
        refreshing.set(false);
        loadingMoreShown.set(false);
        loadingMore = false;
        moreFailures = 0;
        moreError.set(null);
      }
      reloadChannels(wasSignedIn() === true && !signedIn);
      wasSignedIn.set(signedIn);
    });
  });

  return (
    <View style={{ flex: 1, alignSelf: "stretch", flexDirection: "row" }}>
      {/* Column 1: channels and favorites, or a rail of their icons */}
      <View style={{ width: railed() ? RAIL_WIDTH : FULL_WIDTH, borderRightWidth: 1, borderColor: palette().border }}>
        <View
          style={{
            paddingTop: 12,
            paddingHorizontal: railed() ? 0 : 12,
            paddingBottom: 4,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: railed() ? "center" : "space-between",
          }}
        >
          {railed() ? null : <Text style={{ fontSize: 12, fontWeight: 600, color: palette().muted }}>Channels</Text>}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            {railed() ? null : (
              <View
                onPress={channelsLoading() ? undefined : () => reloadChannels()}
                accessibilityLabel="Refresh channels"
                style={{ padding: 4, borderRadius: 6 }}
              >
                <RefreshIcon size={14} enabled={!channelsLoading()} spinning={channelsLoading()} />
              </View>
            )}
            {wide() ? (
              <View
                onPress={toggleChannelsCollapsed}
                accessibilityLabel={channelsCollapsed() ? "Expand channels" : "Collapse channels"}
                style={{ padding: 4, borderRadius: 6 }}
              >
                <SidebarIcon size={16} />
              </View>
            ) : null}
          </View>
        </View>
        <Scroll style={{ flex: 1 }} contentStyle={{ paddingHorizontal: railed() ? 4 : 8, paddingBottom: 8, gap: 4 }}>
          {(channels() ?? []).map((c) =>
            railed() ? (
              <View
                onPress={() => openChannel(c)}
                accessibilityLabel={c.title}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  alignItems: "center",
                  backgroundColor: !favorites() && channel()?.id === c.id ? palette().selected : "transparent",
                }}
              >
                <Text style={{ fontSize: 18, textAlign: "center" }}>{channelIcon(c.title)}</Text>
              </View>
            ) : (
              <View
                onPress={() => openChannel(c)}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  backgroundColor: !favorites() && channel()?.id === c.id ? palette().selected : "transparent",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 18, width: 22, textAlign: "center" }}>{channelIcon(c.title)}</Text>
                  <Text style={{ fontSize: 13, color: palette().text, flex: 1 }}>{c.title}</Text>
                </View>
              </View>
            ),
          )}
          {/* Favorites: its own section after the channels, with the same row style. Signed in only. */}
          {props.user() ? (
            <>
              <View style={{ height: 1, marginVertical: 4, backgroundColor: palette().border }} />
              <View
                onPress={showFavorites}
                accessibilityLabel="Favorites"
                style={{
                  padding: 8,
                  borderRadius: 6,
                  backgroundColor: favorites() ? palette().selected : "transparent",
                }}
              >
                {railed() ? (
                  <Text style={{ fontSize: 18, textAlign: "center" }}>⭐</Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 18, width: 22, textAlign: "center" }}>⭐</Text>
                    <Text style={{ fontSize: 13, color: palette().text, flex: 1 }}>Favorites</Text>
                  </View>
                )}
              </View>
            </>
          ) : null}
        </Scroll>
        {props.footer ? props.footer(railed()) : null}
      </View>

      {/* Column 2: threads of the channel, or favorites */}
      <View style={{ width: 340, borderRightWidth: 1, borderColor: palette().border }}>
        <View style={{ padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 15, color: palette().text, flex: 1 }}>{favorites() ? "Favorites" : channel() ? channel()!.title : "Threads"}</Text>
          <View
            onPress={refreshing() || (!favorites() && !channel()) ? undefined : refreshThreads}
            accessibilityLabel="Refresh threads"
            style={{ padding: 4, borderRadius: 6 }}
          >
            <RefreshIcon size={14} enabled={!refreshing() && (favorites() || !!channel())} spinning={refreshing()} />
          </View>
        </View>
        {error() ? <Failure message={error()!.message} onRetry={() => error()!.retry()} /> : null}
        {listLoading() ? (
          <Scroll style={{ flex: 1 }}>
            <ThreadSkeleton />
          </Scroll>
        ) : (
        <Scroll
          style={{ flex: 1 }}
          contentStyle={{ padding: 8, gap: 6 }}
          onScroll={(e) => {
            if (nearEnd(e)) loadMore();
          }}
        >
          {posts().map((p, i) => (
            <ThreadRow
              post={p}
              index={i}
              entering={animateRows()}
              selected={() => thread()?.id === p.id}
              avatar={() => {
                const name = avatarName(p);
                return name ? avatars()[name] : undefined;
              }}
              onPress={() => openThread(p)}
            />
          ))}
          {loadingMoreShown() ? <LoadingBar /> : null}
          {moreError() && !loadingMoreShown() ? <Failure message={moreError()!.message} onRetry={() => moreError()!.retry()} /> : null}
          {!more() && posts().length > 0 && !loadingMoreShown() ? (
            <Text style={{ fontSize: 13, color: palette().muted, textAlign: "center", padding: 16 }}>No more threads.</Text>
          ) : null}
        </Scroll>
        )}
      </View>

      {/* Column 3: the open thread */}
      <View style={{ flex: 1 }}>
        {thread() ? (
          <Thread
            fid={thread()!.fid ?? channel()?.id ?? ""}
            post={thread()!}
            favorited={favorites()}
            signedIn={!!props.user()}
            onUnfavorited={() => {
              // In the favorites list, the removed thread leaves the list.
              if (favorites()) posts.set(posts().filter((p) => p.id !== thread()?.id));
            }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, color: palette().muted }}>Select a thread</Text>
          </View>
        )}
      </View>
    </View>
  );
}
