# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DiscoveryOS — an unofficial native client for the 4d4y.com Discuz forum, built with [NSH](https://nsh.dev) (a Rust UI framework that renders TSX through each platform's native views). There is no package.json and no npm: the `nsh` CLI builds the Rust crate and bundles the TSX.

## Commands

```sh
nsh run                                    # run the app; TSX edits hot-apply, Rust edits rebuild + restart
nsh check                                  # cargo check, then type-check the TSX
nsh test                                   # cargo test, then the TSX tests, headless
nsh package --target macos --icon icon.png # package (CI uses the scripts/ below instead)
```

- Tests are colocated (`*.test.ts` / `*.test.tsx`) and use the `nsh/test` framework: unit tests `import { expect, test } from "nsh/test"`; UI tests open the app headless via `open("./App.tsx")` and assert on `app.texts()` / `app.press(...)` (see `App.test.tsx`). The headless runner's network answers nothing — tests must not expect real forum responses.
- Generated files live in `.nsh/` (including the generated TS declarations `.nsh/types/discoveryos/native.d.ts`) and `target/`; both are git-ignored.

## Architecture

Two halves talking through one seam:

1. **TSX UI** (`App.tsx`, `src/ui/`) — components over `nsh` primitives (`View`, `Text`, `signal`, `Storage`). `Forum.tsx` is the main screen (channel rail + thread list), `Thread.tsx` a thread's replies/quote/reply flow, `ReplyBox` / `NewThread` / `Conversation` the write paths, `appearance.ts` the palette and themes, `commands.ts` the menu and shortcuts.
2. **Rust crate** (`src/*.rs`, registered in `src/lib.rs`, imported from TSX as `discoveryos/native`) — what TSX can't reach: GB18030 codec (`codec.rs`), per-platform secret storage (`keychain.rs`: macOS Keychain / Windows Credential Manager / Linux Secret Service), files, debug log, and hot-update verification (`update.rs`). Rust doc comments become the generated TS declarations.

**`src/discuz/` is the forum client** between them: `client.ts` owns the session (cookies + formhash, re-login once when a page asks for it), `encoding.ts` does GB18030 requests and form encoding, `parse.ts` turns the forum's HTML into plain data with regexes (no DOM parser — the established pattern here), `quote.ts` converts between reply drafts and Discuz markup, `forum.ts` loads the pages, `cookies.ts` / `vault.ts` persist state (one keychain item holds login + cookies together), plus `avatarCache`, `timeAgo`, `attachments`.

**Embedded video** (`src/bilibili/`, `src/douyin/`, `src/xiaohongshu/`, `src/video/`, rendered by `src/ui/*Player.tsx`): video links detected in post text resolve to playable videos shown in a webview.

### Hot updates and releases — read before pushing

Pushing to these branches is a release action (GitHub Actions, nothing waits for approval):

- `hot-update` → builds + signs a TSX-only `.nshpkg` and publishes it as the **Latest** GitHub Release with a `latest.json` manifest. Installed apps check that Latest release (`src/update.ts`), download, verify against `trust/root.pub`, and swap on next start.
- `app-release` → builds and publishes full app releases for macOS, Windows and Linux (tag `app-v<version>-b<build>`, deliberately never marked Latest — the hot-update channel reads Latest). `app-release-incremental` and `ci-dryrun` build but publish nothing.
- Build numbers are the CI run's Unix time; the version comes from `nsh.json`. Hot-update packages are signed with a release key held in repo secrets, certified by an offline Ed25519 root (`trust/`, `nsh certify`).
- `runner/` (macOS), `runner-windows/`, `runner-linux/` are custom release runners that can load verified update packages, replacing the stock `nsh package` runner; `scripts/package-*` perform the swap into the packaged app.
- CI pins the nsh CLI (`NSH_VERSION` in the workflows) to the version the app embeds via `Cargo.toml` — bump both together.
- `docs/hot-update.md` is the Chinese design doc; its "not implemented" status line is stale — the system is live.

## Conventions

- The forum's wire format is GB18030: every request and form post goes through `src/discuz/encoding.ts`, never plain `fetch` with UTF-8 assumptions.
- Any new external host must be whitelisted in `nsh.json` — `capabilities.network.hosts` for requests, `capabilities.webview.hosts` for webview playback.
- Code comments are English and explain Discuz/NSH quirks and the why; several modules note the Swift app they were ported from (`DiscuzAPI.swift`, `Views/MainView.swift`).
- Commit messages: one short imperative line, often `Area: change`.
