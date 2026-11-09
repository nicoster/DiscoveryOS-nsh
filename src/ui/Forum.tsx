// The signed-in screens in three columns, as the Swift app's split view:
// channels | a channel's threads (or favorites) | the open thread.
// Components run once, so the views switch inside JSX, not by early return.
import { effect, Image, Scroll, signal, Text, untracked, View, type JSX } from "nsh";
import { loadBookmarks, loadChannels, loadPosts } from "../discuz/forum";
import { avatarPicture, userAvatar } from "../discuz/avatarCache";
import { mergePage, type Channel, type Post } from "../discuz/parse";
import { Thread } from "./Thread";
import { nearEnd } from "./nearEnd";
import { LoadingBar } from "./LoadingBar";
import { channelIcon } from "./channelIcon";
import { RefreshIcon } from "./icons";
import { timeAgo } from "../discuz/timeAgo";
import { palette } from "./appearance";
import { loadLastPlace, saveLastPlace } from "./lastPlace";

// The name whose avatar a row shows: a channel's thread author. Favorites rows
// carry no author, so they show the last replier's avatar instead.
function avatarName(p: Post): string | undefined {
  return p.author ?? p.lastReplyBy;
}

// `user` is the signed-in name, or null. The forum lists channels and threads for
// everyone; signing in or out reloads the channel list, since an account sees more.
export function Forum(props: { footer?: JSX.Element; user: () => string | null }) {
  const channels = signal<Channel[] | null>(null);
  const channel = signal<Channel | null>(null);
  const favorites = signal(false);
  const thread = signal<Post | null>(null);
  const posts = signal<Post[]>([]);
  const page = signal(1);
  const more = signal(false);
  const error = signal<string | null>(null);
  // Author avatars for the thread rows, looked up once per author.
  const avatars = signal<Record<string, string>>({});
  const asked = new Set<string>();

  // The place saved by the last run, read once; it is applied once, after the
  // channel list first loads, and only if the user has not picked a place since.
  const savedPlace = loadLastPlace();
  let placeRestored = false;

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
  // The first page of a channel or of favorites is loading: the column shows a
  // centered loader in place of the list. `listRequest` drops answers that were
  // overtaken by a later pick.
  const listLoading = signal(false);
  let listRequest = 0;

  // Loads page `n` of the open list (a channel's threads or the favorites) and
  // merges it in; page 1 replaces the list.
  function fetchList(load: (n: number) => Promise<Post[]>, n: number) {
    const request = n === 1 ? ++listRequest : listRequest;
    load(n)
      .then((list) => {
        if (request !== listRequest) return;
        const merged = n === 1 ? { items: list, more: list.length > 0 } : mergePage(posts(), list);
        more.set(merged.more);
        posts.set(merged.items);
        loadAvatars(list);
        page.set(n);
      })
      .catch((e) => {
        if (request === listRequest) error.set(`Could not load threads: ${e}`);
      })
      .finally(() => {
        loadingMore = false;
        loadingMoreShown.set(false);
        if (request === listRequest) listLoading.set(false);
      });
  }

  function fetchPosts(fid: string, n: number) {
    fetchList((p) => loadPosts(fid, p), n);
  }

  function loadMore() {
    if (loadingMore || !more()) return;
    // Favorites page the same way as a channel: the next page of the favorites.
    if (!favorites() && !channel()) return;
    loadingMore = true;
    loadingMoreShown.set(true);
    if (favorites()) fetchList((p) => loadBookmarks(p), page() + 1);
    else fetchPosts(channel()!.id, page() + 1);
  }

  function showFavorites() {
    favorites.set(true);
    channel.set(null);
    thread.set(null);
    posts.set([]);
    page.set(1);
    more.set(true);
    error.set(null);
    listLoading.set(true);
    fetchList((p) => loadBookmarks(p), 1);
    savePlace();
  }

  function openChannel(c: Channel) {
    favorites.set(false);
    channel.set(c);
    thread.set(null);
    posts.set([]);
    page.set(1);
    error.set(null);
    listLoading.set(true);
    fetchPosts(c.id, 1);
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
        if (request === channelsRequest && !quiet) error.set(`Could not load channels: ${e}`);
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
        // The signed-in channel list goes too: the reload below brings the signed-out one.
        channels.set(null);
        favorites.set(false);
        channel.set(null);
        thread.set(null);
        posts.set([]);
        page.set(1);
        more.set(false);
        listLoading.set(false);
        loadingMoreShown.set(false);
        loadingMore = false;
      }
      reloadChannels(wasSignedIn() === true && !signedIn);
      wasSignedIn.set(signedIn);
    });
  });

  return (
    <View style={{ flex: 1, alignSelf: "stretch", flexDirection: "row" }}>
      {/* Column 1: channels and favorites */}
      <View style={{ width: 220, borderRightWidth: 1, borderColor: palette().border }}>
        <View style={{ paddingTop: 12, paddingHorizontal: 12, paddingBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 12, fontWeight: 600, color: palette().muted }}>Channels</Text>
          <View
            onPress={channelsLoading() ? undefined : () => reloadChannels()}
            accessibilityLabel="Refresh channels"
            style={{ padding: 4, borderRadius: 6 }}
          >
            <RefreshIcon size={14} enabled={!channelsLoading()} />
          </View>
        </View>
        <Scroll style={{ flex: 1 }} contentStyle={{ paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
          {(channels() ?? []).map((c) => (
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
          ))}
          {/* Favorites: its own section after the channels, with the same row style. Signed in only. */}
          {props.user() ? (
            <>
              <View style={{ height: 1, marginVertical: 4, backgroundColor: palette().border }} />
              <View
                onPress={showFavorites}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  backgroundColor: favorites() ? palette().selected : "transparent",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 18, width: 22, textAlign: "center" }}>⭐</Text>
                  <Text style={{ fontSize: 13, color: palette().text, flex: 1 }}>Favorites</Text>
                </View>
              </View>
            </>
          ) : null}
        </Scroll>
        {props.footer}
      </View>

      {/* Column 2: threads of the channel, or favorites */}
      <View style={{ width: 340, borderRightWidth: 1, borderColor: palette().border }}>
        <View style={{ padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 15, color: palette().text, flex: 1 }}>{favorites() ? "Favorites" : channel() ? channel()!.title : "Threads"}</Text>
          <View
            onPress={listLoading() || (!favorites() && !channel()) ? undefined : refreshThreads}
            accessibilityLabel="Refresh threads"
            style={{ padding: 4, borderRadius: 6 }}
          >
            <RefreshIcon size={14} enabled={!listLoading() && (favorites() || !!channel())} />
          </View>
        </View>
        {error() ? <Text style={{ fontSize: 13, color: palette().danger, padding: 12 }}>{error()}</Text> : null}
        {listLoading() ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <LoadingBar />
          </View>
        ) : (
        <Scroll
          style={{ flex: 1 }}
          contentStyle={{ padding: 8, gap: 6 }}
          onScroll={(e) => {
            if (nearEnd(e)) loadMore();
          }}
        >
          {posts().map((p) => (
            <View
              onPress={() => openThread(p)}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: thread()?.id === p.id ? palette().selected : palette().surface,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              {avatarName(p) && avatars()[avatarName(p)!] ? (
                <Image src={avatars()[avatarName(p)!]} style={{ width: 32, height: 32, borderRadius: 6 }} />
              ) : null}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 13, color: palette().text }}>{p.title}</Text>
                <Text style={{ fontSize: 11, color: palette().muted }}>
                  {[p.author, (p.lastReplyAt ?? p.at) ? timeAgo(p.lastReplyAt ?? p.at!) : undefined].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {/* Replies in a fixed right-hand column, so the counts line up down the list. */}
              <View style={{ width: 44, alignItems: "flex-end", gap: 1 }}>
                <Text style={{ fontSize: 13, color: palette().text }}>{String(p.replies)}</Text>
                <Text style={{ fontSize: 10, color: palette().muted }}>replies</Text>
              </View>
            </View>
          ))}
          {loadingMoreShown() ? <LoadingBar /> : null}
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
