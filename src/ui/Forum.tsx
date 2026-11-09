// The signed-in screens in three columns, as the Swift app's split view:
// channels | a channel's threads (or favorites) | the open thread.
// Components run once, so the views switch inside JSX, not by early return.
import { createAnimatedValue, createMotion, effect, Overlay, type YNode, LayoutAnimation, List, reduceMotion, Scroll, signal, Text, untracked, View, windowSize, type JSX } from "nsh";
import { loadBookmarks, loadChannels, loadMyReplies, loadMyThreads, loadPosts, searchThreads } from "../discuz/forum";
import { avatarPicture, userAvatar } from "../discuz/avatarCache";
import { mergePage, type Channel, type Post } from "../discuz/parse";
import { dbg } from "../debugConsole";
import { Thread } from "./Thread";
import { LoadingBar } from "./LoadingBar";
import { channelIcon } from "./channelIcon";
import { RefreshIcon, SidebarIcon } from "./icons";
import { palette } from "./appearance";
import { loadLastPlace, saveLastPlace } from "./lastPlace";
import { Failure } from "./Failure";
import { ThreadSkeleton } from "./Skeleton";
import { ThreadRow } from "./ThreadRow";
import { channelsCollapsed, channelsRailed, FULL_WIDTH, RAIL_BELOW, RAIL_WIDTH, toggleChannelsCollapsed } from "./channelRail";
import { animateSearchChange, SearchControl, TitleBar, titleBarShown, type SearchProps } from "./TitleBar";

// The name whose avatar a row shows: a channel's thread author. Favorites rows
// carry no author, so they show the last replier's avatar instead.
function avatarName(p: Post): string | undefined {
  return p.author ?? p.lastReplyBy;
}

/** A count in short form: 999 stays, 2389 reads as "2.4k". */
function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.floor(n / 100) / 10;
  return `${k}k`;
}

/** A failed load: what to say, and what Retry does. */
interface Failed {
  message: string;
  retry: () => void;
}

// The first page of each list as it last loaded, keyed by list. Opening a list again
// shows it at once while its refresh runs. Cleared on sign-out: an account sees more.
const FAVORITES_KEY = "favorites";
const MY_THREADS_KEY = "my-threads";
const MY_REPLIES_KEY = "my-replies";
const forumKey = (fid: string) => `forum:${fid}`;
const searchKey = (term: string) => `search:${term}`;

/** One channel in the list: its icon and title with its new-post count, or in the rail its
 * icon with the count as a badge. Hovering and being selected fade a tint in and out. */
function ChannelRow(props: { channel: Channel; selected: () => boolean; railed: () => boolean; onPress: () => void; delay: number }) {
  const hover = createAnimatedValue(0);
  const picked = createAnimatedValue(0);
  // The icon swells as the row is hovered, as the Dock's icons do.
  const iconScale = hover.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  // Opened from the stack, each row slides down into place, a little after the one before it.
  const entrance = createMotion({ initial: { opacity: 0, translateY: -10 }, enter: "fadeInUp", duration: 220, delay: props.delay });
  effect(() => {
    picked.timing(props.selected() ? 1 : 0, { duration: 180 }).catch(() => undefined);
  });
  const c = props.channel;
  // The pill's width follows the count's length, up to the icon's right edge plus a little.
  const pillWidth = Math.min(30, Math.ceil(compactCount(c.newPosts).length * 6.5) + 6);
  return (
    <View
      onPress={props.onPress}
      onHoverIn={() => {
        hover.timing(1, { duration: 120 }).catch(() => undefined);
      }}
      onHoverOut={() => {
        hover.timing(0, { duration: 120 }).catch(() => undefined);
      }}
      accessibilityLabel={c.title}
      style={{ ...entrance.style, padding: 8, borderRadius: 6, alignItems: props.railed() ? "center" : undefined }}
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
          opacity: hover.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 6,
          backgroundColor: palette().selected,
          opacity: picked,
        }}
      />
      {props.railed() ? (
        <View>
          <View style={{ transform: [{ scale: iconScale }] }}>
            <Text style={{ fontSize: 18, textAlign: "center" }}>{channelIcon(c.title)}</Text>
          </View>
          {c.newPosts > 0 ? (
            // The count at the icon's top-right corner, on a faint pill sized to the count. Where
            // it runs past the icon's right edge, a gradient of the pill's colour fades it out.
            <View
              style={{
                position: "absolute",
                top: -2,
                left: 16,
                width: pillWidth,
                height: 14,
                borderRadius: 7,
                overflow: "hidden",
                backgroundColor: palette().surface,
              }}
            >
              <Text numberOfLines={1} style={{ fontSize: 11, color: palette().muted, paddingLeft: 3, lineHeight: 14 }}>
                {compactCount(c.newPosts)}
              </Text>
              {pillWidth > 17 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 17,
                    right: 0,
                    backgroundImage: `linear-gradient(to right, transparent, ${palette().surface} 70%)`,
                  }}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 22, alignItems: "center", transform: [{ scale: iconScale }] }}>
            <Text style={{ fontSize: 18, textAlign: "center" }}>{channelIcon(c.title)}</Text>
          </View>
          <Text style={{ fontSize: 13, color: palette().text, flex: 1 }}>{c.title}</Text>
          {c.newPosts > 0 ? <Text style={{ fontSize: 12, color: palette().muted }}>{compactCount(c.newPosts)}</Text> : null}
        </View>
      )}
    </View>
  );
}

// `user` is the signed-in name, or null. The forum lists channels and threads for
// everyone; signing in or out reloads the channel list, since an account sees more.
export function Forum(props: { footer?: (compact: boolean) => JSX.Element; user: () => string | null }) {
  const channels = signal<Channel[] | null>(null);
  const channel = signal<Channel | null>(null);
  const favorites = signal(false);
  // The signed-in user's own threads, shown like favorites: their own column-1 entry.
  const mine = signal(false);
  // The threads the user replied to: a third list in the same section.
  const replies = signal(false);
  const thread = signal<Post | null>(null);
  const posts = signal<Post[]>([]);
  const page = signal(1);
  const more = signal(false);
  const error = signal<Failed | null>(null);
  // Author avatars for the thread rows, looked up once per author.
  const avatars = signal<Record<string, string>>({});
  const asked = new Set<string>();
  const listCache = new Map<string, { items: Post[]; more: boolean }>();
  // Title search: the term whose results the threads column shows (null while browsing a
  // channel or favorites), whether the search field is open, and what it holds.
  const searchTerm = signal<string | null>(null);
  const searchOpen = signal(false);
  const searchDraft = signal("");
  // Channels with no new posts sit under More. More opens as a menu; the channel the user
  // picks from it is pinned into the list until another channel opens.
  const moreOpen = signal(false);
  const pinned = signal<string | null>(null);
  // The width of the stack of icons, which decides how many fit.
  const stackWidth = signal(0);
  // The rows of the open stack, as the overlay that collapses it is anchored to.
  const listAnchor = signal<YNode | null>(null);
  const STACK_ICON = 26;
  // The distance between icons: wider in the full column, kept in the rail where space is short.
  const stackStep = () => (railed() ? 12 : 18);
  const listed = () => (channels() ?? []).filter((c) => c.newPosts > 0 || c.id === pinned());
  const hidden = () => (channels() ?? []).filter((c) => c.newPosts === 0 && c.id !== pinned());

  // Opening or closing More, and pinning a channel, animate the list's change.
  function animateListChange() {
    const curve = { type: "easeInEaseOut" as const };
    LayoutAnimation.configureNext({
      duration: 200,
      update: curve,
      create: { ...curve, property: "opacity" },
      delete: { ...curve, property: "opacity" },
    });
  }
  function toggleMore() {
    animateListChange();
    moreOpen.set(!moreOpen());
  }
  // Going to any other channel or list closes More; picking from More keeps it open.
  function collapseMore() {
    if (!moreOpen()) return;
    animateListChange();
    moreOpen.set(false);
  }

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
    saveLastPlace({ channel: favorites() || mine() || replies() ? null : channel(), thread: thread() });
  }

  function restorePlace(list: Channel[]) {
    if (placeRestored) return;
    placeRestored = true;
    savedPlace.then((place) => {
      const saved = place?.channel;
      if (!saved || favorites() || mine() || replies() || channel()) return;
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
        posts.set(merged.items);
        if (n === 1) listCache.set(key, { items: merged.items, more: merged.more });
        loadAvatars(list);
        page.set(n);
        // A search with hits is done: its field hides, and the results and the header stay.
        if (n === 1 && list.length > 0 && key === searchKey(searchTerm() ?? "")) {
          animateSearchChange();
          searchOpen.set(false);
        }
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
    // Search results are one page: there is no next page to fetch.
    if (searchTerm() !== null) return;
    // Once the end shows Retry, scrolling does not fetch again: the button does.
    if (loadingMore || !more() || moreError()) return;
    // Favorites page the same way as a channel: the next page of the favorites.
    if (favorites()) {
      loadingMore = true;
      loadingMoreShown.set(true);
      fetchList((p) => loadBookmarks(p), page() + 1, FAVORITES_KEY);
    } else if (mine()) {
      loadingMore = true;
      loadingMoreShown.set(true);
      fetchList((p) => loadMyThreads(p), page() + 1, MY_THREADS_KEY);
    } else if (replies()) {
      loadingMore = true;
      loadingMoreShown.set(true);
      fetchList((p) => loadMyReplies(p), page() + 1, MY_REPLIES_KEY);
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
    collapseMore();
    searchTerm.set(null);
    searchOpen.set(false);
    pinned.set(null);
    favorites.set(true);
    mine.set(false);
    replies.set(false);
    channel.set(null);
    thread.set(null);
    openList(FAVORITES_KEY, (p) => loadBookmarks(p));
    savePlace();
  }

  function showMine() {
    collapseMore();
    searchTerm.set(null);
    searchOpen.set(false);
    mine.set(true);
    favorites.set(false);
    replies.set(false);
    channel.set(null);
    thread.set(null);
    openList(MY_THREADS_KEY, (p) => loadMyThreads(p));
    savePlace();
  }

  function showReplies() {
    collapseMore();
    searchTerm.set(null);
    searchOpen.set(false);
    replies.set(true);
    favorites.set(false);
    mine.set(false);
    channel.set(null);
    thread.set(null);
    openList(MY_REPLIES_KEY, (p) => loadMyReplies(p));
    savePlace();
  }

  function openChannel(c: Channel) {
    collapseMore();
    searchTerm.set(null);
    searchOpen.set(false);
    favorites.set(false);
    mine.set(false);
    replies.set(false);
    channel.set(c);
    // A channel from More stays in the list while it is open; any other pick sends it back.
    pinned.set(c.newPosts === 0 ? c.id : null);
    thread.set(null);
    openList(forumKey(c.id), (p) => loadPosts(c.id, p));
    savePlace();
  }

  function openThread(p: Post) {
    thread.set(p);
    savePlace();
  }

  // Shows the threads whose titles contain `term`, in the threads column. The channel or
  // favorites open before it stays selected in the column, and closing search returns to it.
  function openSearch(term: string) {
    const t = term.trim();
    if (!t) return;
    searchTerm.set(t);
    searchOpen.set(true);
    searchDraft.set(t);
    openList(searchKey(t), () => searchThreads(t));
  }

  // Closes the search field. With results showing, the channel or favorites they replaced
  // comes back; an empty search only hides the field.
  function closeSearch() {
    const wasSearching = searchTerm() !== null;
    searchTerm.set(null);
    searchOpen.set(false);
    searchDraft.set("");
    if (!wasSearching) return;
    if (favorites()) {
      openList(FAVORITES_KEY, (p) => loadBookmarks(p));
    } else if (mine()) {
      openList(MY_THREADS_KEY, (p) => loadMyThreads(p));
    } else if (replies()) {
      openList(MY_REPLIES_KEY, (p) => loadMyReplies(p));
    } else if (channel()) {
      const c = channel()!;
      openList(forumKey(c.id), (p) => loadPosts(c.id, p));
    } else {
      posts.set([]);
      more.set(false);
      error.set(null);
    }
  }

  // The search control, in the title bar or, where the platform draws none, the threads column's header.
  const searchProps: SearchProps = {
    open: searchOpen,
    draft: searchDraft,
    signedIn: () => !!props.user(),
    onDraft: (text: string) => searchDraft.set(text),
    // Submitting searches; the field hides once the results arrive with hits (see fetchList).
    onSubmit: openSearch,
    onOpen: () => {
      animateSearchChange();
      searchOpen.set(true);
    },
    // A press outside the field: the field hides, and its draft goes back to the search shown.
    onHide: () => {
      animateSearchChange();
      searchOpen.set(false);
      searchDraft.set(searchTerm() ?? "");
    },
    onClose: () => {
      animateSearchChange();
      closeSearch();
    },
  };

  // The threads column's title: the search it shows, else the channel or list open.
  const headerTitle = () =>
    searchTerm() !== null ? `包含 “${searchTerm()}” 的帖子` : favorites() ? "Favorites" : mine() ? "My Posts" : replies() ? "My Replies" : channel() ? channel()!.title : "Threads";

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
    if (searchTerm() !== null) openSearch(searchTerm()!);
    else if (favorites()) showFavorites();
    else if (mine()) showMine();
    else if (replies()) showReplies();
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
        // Search needs an account: its field and results go with the sign-out.
        searchTerm.set(null);
        searchOpen.set(false);
        searchDraft.set("");
        // Cached lists are per account: they go with the sign-out.
        listCache.clear();
        // The signed-in channel list goes too: the reload below brings the signed-out one.
        channels.set(null);
        favorites.set(false);
        mine.set(false);
        replies.set(false);
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

  // A channel row; `delay` staggers its entrance when the stack opens.
  function renderChannel(c: Channel, delay = 0) {
    const selected = () => searchTerm() === null && !favorites() && !mine() && !replies() && channel()?.id === c.id;
    return <ChannelRow channel={c} selected={selected} railed={railed} onPress={() => openChannel(c)} delay={delay} />;
  }

  // The stack of icons for the channels under More. Each icon overlaps the one before it;
  // the ones that do not fit are left out, and the first of them fades.
  function stackCells() {
    const w = stackWidth();
    const step = stackStep();
    const fit = w >= STACK_ICON ? Math.floor((w - STACK_ICON) / step) + 1 : 0;
    // The first icon is on top: the cells are drawn last to first, so each one covers the next.
    return hidden()
      .slice(0, fit + 1)
      .map((c, i) => ({ c, i }))
      .reverse()
      .map(({ c, i }) => (
        <View
          style={{
            position: "absolute",
            top: 2,
            left: i * step,
            width: STACK_ICON,
            height: STACK_ICON,
            borderRadius: STACK_ICON / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette().surface,
          }}
        >
          <Text style={{ fontSize: 16 }}>{channelIcon(c.title)}</Text>
          {/* Later icons are paler: a surface-coloured veil over the icon, so each icon stays
              solid and the one before it still covers the next. The one that does not fit is
              veiled nearly out. */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: STACK_ICON / 2,
              backgroundColor: palette().surface,
              opacity: i < fit ? Math.min(0.7, i * 0.12) : 0.9,
            }}
          />
        </View>
      ));
  }

  return (
    <View style={{ flex: 1, alignSelf: "stretch" }}>
      {titleBarShown() ? <TitleBar wide={wide} search={searchProps} /> : null}
      <View style={{ flex: 1, alignSelf: "stretch", flexDirection: "row" }}>
      {/* Any press while the channels are open collapses them; presses still reach what is under them. */}
      {moreOpen() && listAnchor() ? (
        <Overlay anchor={listAnchor()} onPressOutside={collapseMore}>
          <View style={{ width: 0, height: 0 }} />
        </Overlay>
      ) : null}
      {/* Column 1: channels and favorites, or a rail of their icons */}
      <View style={{ width: railed() ? RAIL_WIDTH : FULL_WIDTH, borderRightWidth: 1, borderColor: palette().border }}>
        <View
          style={{
            // Under the title bar the header sits flush against it; with no bar, it keeps the top inset.
            paddingTop: titleBarShown() ? 0 : 12,
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
            {wide() && !titleBarShown() ? (
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
          {/* Channels with new posts, then More: the rest, shown when More is opened. */}
          {listed().map((c) => renderChannel(c))}
          {/* Channels without new posts: a stack of their icons; opening it lists them in place. */}
          {hidden().length > 0 ? (
            <View>
              {moreOpen() ? (
                // The rows are the overlay's anchor: a press on them is not outside it, so it
                // reaches the row's own press and picks the channel.
                <View ref={(n) => listAnchor.set(n)}>{hidden().map((c, i) => renderChannel(c, i * 40))}</View>
              ) : (
                <View
                  onPress={toggleMore}
                  accessibilityLabel="More channels"
                  style={{ paddingVertical: 4, paddingHorizontal: railed() ? 4 : 8, borderRadius: 6 }}
                >
                  <View onLayout={(b) => stackWidth.set(b.size.width)} style={{ height: 30, overflow: "hidden" }}>
                    {stackCells()}
                  </View>
                </View>
              )}
            </View>
          ) : null}
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
                  backgroundColor: favorites() && searchTerm() === null ? palette().selected : "transparent",
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
              <View
                onPress={showMine}
                accessibilityLabel="My Posts"
                style={{
                  padding: 8,
                  borderRadius: 6,
                  backgroundColor: mine() && searchTerm() === null ? palette().selected : "transparent",
                }}
              >
                {railed() ? (
                  <Text style={{ fontSize: 18, textAlign: "center" }}>📝</Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 18, width: 22, textAlign: "center" }}>📝</Text>
                    <Text style={{ fontSize: 13, color: palette().text, flex: 1 }}>My Posts</Text>
                  </View>
                )}
              </View>
              <View
                onPress={showReplies}
                accessibilityLabel="My Replies"
                style={{
                  padding: 8,
                  borderRadius: 6,
                  backgroundColor: replies() && searchTerm() === null ? palette().selected : "transparent",
                }}
              >
                {railed() ? (
                  <Text style={{ fontSize: 18, textAlign: "center" }}>💬</Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 18, width: 22, textAlign: "center" }}>💬</Text>
                    <Text style={{ fontSize: 13, color: palette().text, flex: 1 }}>My Replies</Text>
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
        <View style={{ padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          {searchOpen() && !titleBarShown() ? null : (
            <Text style={{ fontSize: 15, color: palette().text, flex: 1 }}>{headerTitle()}</Text>
          )}
          {titleBarShown() ? null : <SearchControl {...searchProps} />}
          <View
            onPress={refreshing() || (!favorites() && !mine() && !replies() && !channel()) ? undefined : refreshThreads}
            accessibilityLabel="Refresh threads"
            style={{ padding: 4, borderRadius: 6 }}
          >
            <RefreshIcon size={14} enabled={!refreshing() && (favorites() || mine() || replies() || !!channel())} spinning={refreshing()} />
          </View>
        </View>
        {error() ? <Failure message={error()!.message} onRetry={() => error()!.retry()} /> : null}
        {searchTerm() !== null && !listLoading() && !error() && posts().length === 0 ? (
          <Text style={{ fontSize: 13, color: palette().muted, textAlign: "center", padding: 16 }}>No threads match “{searchTerm()}”.</Text>
        ) : null}
        {listLoading() ? (
          <Scroll style={{ flex: 1 }}>
            <ThreadSkeleton />
          </Scroll>
        ) : (
        // A virtualized list: only the rows near the viewport exist, and they are reused as
        // the user scrolls. Its end (loading, failure, or "No more threads.") is the footer.
        <List
          style={{ flex: 1 }}
          contentStyle={{ padding: 8, gap: 6 }}
          each={posts()}
          estimatedItemSize={64}
          onLoadMore={loadMore}
          footer={() => (
            <View>
              {loadingMoreShown() ? <LoadingBar /> : null}
              {moreError() && !loadingMoreShown() ? <Failure message={moreError()!.message} onRetry={() => moreError()!.retry()} /> : null}
              {!more() && posts().length > 0 && !loadingMoreShown() ? (
                <Text style={{ fontSize: 13, color: palette().muted, textAlign: "center", padding: 16 }}>No more threads.</Text>
              ) : null}
            </View>
          )}
        >
          {(item) => (
            <ThreadRow
              item={item}
              selected={() => thread()?.id === item().id}
              avatar={() => {
                const name = avatarName(item());
                return name ? avatars()[name] : undefined;
              }}
              onPress={() => openThread(item())}
            />
          )}
        </List>
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
    </View>
  );
}
