# DiscoveryOS

**An unofficial, native client for the [4d4y.com](https://www.4d4y.com) Discuz forum, built with [NSH](https://nsh.dev).**

> **Unofficial — not affiliated with, endorsed by or sponsored by 4d4y.com or Comsenz (Discuz!).** Your use of the
> forum through this app is subject to the forum's own rules and terms. Please keep request rates reasonable.

DiscoveryOS is a lightweight, native desktop app for reading and posting on the 4d4y.com forum. Instead of running the
website in a full browser window, it requests the same Discuz pages the site serves, parses them, and draws channels,
threads and replies in a native interface. Your forum account does the work: signing in, replying, search and private
messages all go through the forum itself.

## What is NSH?

[NSH (Native Shell)](https://nsh.dev) is a Rust UI framework that renders one app through each platform's own native
views. The interface here is TSX (`App.tsx`, `src/ui/`). The Rust crate in this repository supplies the pieces TSX
cannot reach on its own: GB18030 conversion (the forum's character set) and the macOS Keychain.

## Features

- **Channels and threads**: a channel rail and paged thread lists. A list shows the last result while it refreshes,
  and retries when a request fails.
- **Reading**: thread pages with posts and replies, parsed from the forum's HTML, with cached avatars.
- **Replying**: a reply box under a thread, with toasts for success and failure.
- **Search**: thread titles across every channel (the forum requires a signed-in account for search).
- **Your activity**: your threads, your replies, bookmarks and private messages.
- **Favorites**: threads you star are kept in the app's own storage and listed together.
- **Appearance**: light, dark or system theme.

## Platforms

| Platform | Status |
| --- | --- |
| macOS | Primary target. Saved passwords use the macOS Keychain. |
| Other NSH targets | Not verified. The Keychain module is macOS-only, so the password feature will not work elsewhere. |

## Requirements

- The **`nsh` CLI** and **Rust**. The crate depends on `nsh-core` and `nsh-base` (`Cargo.toml`); keep them at the version
  of the `nsh` you run.
- A **4d4y.com account** to reply, search, and see your own activity. Browsing works without one.

## How it works

- **Forum client** (`src/discuz/`): requests the Discuz pages (`index.php`, `forumdisplay.php`, `viewthread.php`,
  `search.php`, the user and message pages), keeps the session cookies and form hash, and posts forms as GB18030.
  `parse.ts` turns the HTML into plain data. `encoding.ts` and `timeAgo.ts` handle entities and relative dates.
- **Native crate** (`src/lib.rs`, `src/codec.rs`, `src/keychain.rs`): exports `Gb18030` (bytes to text and back) and
  `Keychain` to TSX as `discoveryos/native`.
- **Interface** (`App.tsx`, `src/ui/`): sign-in, the forum view, threads, conversations, reply box, favorites,
  appearance and the title bar.

## Build and run

```sh
nsh run                      # run on this machine
nsh check                    # cargo check of the crate, then type checks App.tsx
nsh test                     # cargo test, then the TSX tests, headless
nsh package --target macos   # build a package for macOS
```

`nsh` builds the Rust crate and bundles the TSX. TSX edits are hot updates; Rust edits rebuild and restart the app.
Generated files stay in `.nsh/` and Cargo's output in `target/`. Both are git-ignored.

## Signing in

Sign in from the account row with your 4d4y.com username and password. The session cookies are kept between launches.
If you choose to save the password, it is stored in the macOS Keychain. Signing out calls the forum's logout and clears
the local cookies.

## License

No license has been chosen yet.
