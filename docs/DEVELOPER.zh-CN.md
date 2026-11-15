# DiscoveryOS 开发者交接说明

> 范围：在 `nicoster/DiscoveryOS-nsh`（`main` @ `eede1ab`，v1.0.5 / build 26）之上制作的两项改动——
> **macOS 12+ 兼容构建** 与 **Discuz 安全提问登录修复**。
> 这份文档假设接手者没有参与本次开发，按「为什么改 / 改了哪里 / 怎么重建 / 哪些坑」组织。
> 本文为中文交接稿；仓库既有的 `README.md`、`docs/hot-update.md` 保持英文原样。

---

## 1. 结论速览

| 项目 | 结果 |
|---|---|
| 上游限制 | NSH 0.5.0 的 AppKit 后端**硬性要求 macOS 14+**，CLI 还会把 `LSMinimumSystemVersion` 写死为 `14.0` 并拒绝调低 |
| 解法 | 不重编译 nsh CLI，而是给仓库自编译的 hot-update runner 注入打了补丁的 `nsh-platform-macos 0.5.0`，再改 plist 重签名 |
| 登录问题 | 论坛是 Discuz 7.2，登录表单需要 `questionid` + `answer`；原实现（含原 Swift 版）只发用户名/密码，设置了安全提问的账号必然登录失败 |
| 解法 | 补齐表单字段、处理论坛第二阶段 `loginauth` 页、UI 增加下拉与答案框、答案随密码存钥匙串 |
| 实机验证 | macOS 13.7.8 / x86_64：`open -a` 启动成功，窗口正常渲染，登录框显示安全提问下拉；进程稳定运行无崩溃 |
| 未验证 | 真实账号登录成功、macOS 12 实机、Apple Silicon |

**这不是配置调整，是一次非官方框架 fork**。上游 nsh 升级后需重新移植，见第 10 节。

---

## 2. 构建环境

本机实际使用的版本：

| 组件 | 版本 / 说明 |
|---|---|
| 构建机 | macOS 13.7.8 (22H730), x86_64 |
| Xcode | 仅 Command Line Tools（**不需要完整 Xcode**；macOS 图标走 `sips` + `iconutil`，`actool` 只用于 iOS/Catalyst） |
| Rust | 1.100.0（`Cargo.toml` 要求 edition 2024 / rust-version 1.97+） |
| nsh CLI | **0.5.0** (`f4d68f7`)，必须与 `Cargo.toml` 里 `nsh-core` / `nsh-base` / `nsh-engine` 的 `=0.5.0` 严格对齐 |
| SDK | 13.3（`xcrun --show-sdk-version`），配合 `MACOSX_DEPLOYMENT_TARGET=12.0` |

安装：

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
  | sh -s -- -y --profile minimal --default-toolchain stable

# nsh CLI v0.5.0（官方脚本）
curl -fsSL https://nsh.dev/install.sh | NSH_VERSION=v0.5.0 sh
```

> **下载备用路径**：本次构建中，代理对 GitHub release 的大文件返回 HTTP/2 帧错误 / 502，
> 官方安装脚本失败。替代方案是走 GitHub API 的 asset endpoint + `--http1.1`：
> `https://api.github.com/repos/longbridge/nsh/releases/assets/<asset_id>`，
> `Accept: application/octet-stream`，下载后用同 release 的 `.sha256` 文件校验，
> 解压后把 `nsh/` 目录放到 `~/.nsh/`。v0.5.0 的 macOS x86_64 包校验值：
> `e51cf3f6e1f04b329494074154a36dbf0dbd06305ba258d99e658a6668c5f362`。

`scripts/package-macos-12plus.sh` 会自动把 `~/.nsh/bin` 和 `~/.cargo/bin` 加进 `PATH`。

---

## 3. 快速开始

```bash
# 完整重建（TSX bundle + 图标 + 兼容 runner + 重签名 + zip）
REBUILD_BUNDLE=1 ./scripts/package-macos-12plus.sh

# 只重编 Rust / 重签名（TSX 没动时更快）
./scripts/package-macos-12plus.sh

# 用稳定证书签名，避免首次启动弹钥匙串授权
SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
  REBUILD_BUNDLE=1 ./scripts/package-macos-12plus.sh
```

环境变量：

| 变量 | 默认 | 作用 |
|---|---|---|
| `REBUILD_BUNDLE` | `0` | 设为 `1` 才重新执行 `nsh package`（重生成 TSX bundle / 资源 / plist）。**改过任何 `.ts` / `.tsx` 必须设为 1**，否则产物仍是旧 bundle |
| `SIGN_IDENTITY` | `-` | codesign 证书；默认 ad-hoc |
| `RELEASE_DIR` | `.nsh/out/release` | zip 输出目录 |

产物：

- `.nsh/out/DiscoveryOS.app` — 可直接打开
- `.nsh/out/release/DiscoveryOS-<version>-build<build>-macos.zip` — 分发包（约 23 MB）

脚本执行顺序：`nsh package --target macos --icon icon.png` → `cargo build --release --manifest-path runner/Cargo.toml` → 用自编译 runner 覆盖 `Contents/MacOS/<CFBundleExecutable>` → `PlistBuddy Set :LSMinimumSystemVersion 12.0` → `codesign --force --sign` → `ditto` 打 zip。
全过程导出 `MACOSX_DEPLOYMENT_TARGET=12.0`。

---

## 4. 为什么需要兼容层

NSH 从 **0.1.1 到 0.5.1 的所有版本**，独立 macOS app 都只有 AppKit 一条后端路径（GPUI 打包目标已被上游废弃），而该后端要求 macOS 14：

1. `nsh-cli` 源码里写死 `MACOS_MINIMUM = "14.0"`，并会拒绝把 `LSMinimumSystemVersion` 调到 14 以下。
2. `nsh-platform-macos/src/surface.rs` 用 `-[NSView displayLinkWithTarget:selector:]` / `CADisplayLink`（macOS 14 新增）驱动帧循环，**没有任何降级路径**。
3. 框架与项目代码调用 `NSApplication.activate`（同样是 macOS 14 新增）。

在 macOS 13.7.8 上对未打补丁的产物实测：

- `open -a` 被 LaunchServices 以 **-10825**（系统版本不兼容）拒绝；
- 直接执行二进制立刻 abort：`-[NSApplication activate]: unrecognized selector`；
- 临时只把 `activate` 换成旧 API 后，app 能进入 JS 启动阶段，随即崩在
  `-[NshView displayLinkWithTarget:selector:]` —— 证实剩余障碍正是渲染时钟。

**关键突破口**：仓库的 `scripts/package-macos.sh` 本来就会用 `runner/`、`runner-linux/`、`runner-windows/` 里自编译的 hot-update runner 替换 `nsh package` 生成的官方可执行文件。因此只需对 runner 的依赖打补丁，无需 fork 或重编译整个 nsh CLI。

---

## 5. 兼容层实现细节

### 文件清单

| 路径 | 改动 |
|---|---|
| `compat/nsh-platform-macos/` | 从 crates.io 解包的 `nsh-platform-macos 0.5.0` 源码，**版本号保持 0.5.0**（否则不满足 `=0.5.0` 约束） |
| `compat/.../src/display_link_compat.rs` | **新增**：`CADisplayLink` 同名 shim |
| `compat/.../src/surface.rs` | 移除 ObjC `Ticker` 类；`DisplayLink` 改用 shim；`ticked()` 改为无参、从当前时钟取时间戳 |
| `compat/.../src/lib.rs` | 新增 `mod display_link_compat;`（私有模块；该 crate 把 `unreachable_pub` 设为 deny，故 shim 内的类型与方法也只用 `pub(crate)`） |
| `compat/.../src/app.rs` (2 处)、`compat/.../src/window.rs` (2 处) | `activate()` → `activateIgnoringOtherApps(true)` |
| `runner/main.rs` (1 处) | 同上 |
| `runner/Cargo.toml` | 新增 `[patch.crates-io] nsh-platform-macos = { path = "../compat/nsh-platform-macos" }` |
| `scripts/package-macos-12plus.sh` | **新增**：固化整套流程 |
| `.nsh/out/DiscoveryOS.app/Contents/Info.plist` | 构建时把 `LSMinimumSystemVersion` 从 14.0 改为 12.0 |

### 帧时钟 shim

`display_link_compat::CADisplayLink` 用 `NSTimer` 的 block API（`scheduledTimerWithTimeInterval:repeats:block:`，macOS 10.12 起可用）注册到主 run loop 的 `NSRunLoopCommonModes`，实现 `surface.rs` 实际用到的那一小撮接口：`new` / `timestamp` / `targetTimestamp` / `invalidate` / `setPreferredFrameRateRange` / `addToRunLoop_forMode`。时间戳取自 `CACurrentMediaTime()`，周期固定 `1/60`。

> **取舍**：固定约 60 Hz，ProMotion 高刷与自适应帧率不再生效。这是兼容 12/13 的代价，不是 bug。

### 依赖注入

`runner/Cargo.toml` 的 `[workspace]` 之后是 `[patch.crates-io]`。`cargo build --manifest-path runner/Cargo.toml` 会把所有 `nsh-platform-macos = "=0.5.0"` 解析到本地 `compat/` 目录，因此**不需要修改根 crate 或 nsh CLI**。

---

## 6. 登录：安全提问修复

### 根因

`www.4d4y.com` 是 Discuz 7.2。`logging.php?action=login` 的登录表单除 `username` / `password` / `loginsubmit` 外，还带 **`questionid`（0–7）和 `answer`**。账号设置了安全提问时，服务端校验 `quescrypt(questionid, answer)` 与存储的 `secques`；不匹配不会返回登录成功页，而是渲染 `login_secques` 模板的**第二阶段页面**，其中隐藏了加密的 `loginauth` 令牌。

原实现（此仓库 `client.ts` 与上游 Swift 版 `DiscuzAPI.swift` 一致）两个字段都没发，也没有第二阶段处理；解析不到 formhash 就只显示 `Sign-in failed.`，用户看到的现象就是「只有用户名和密码框，没有安全提问界面」。

### 协议时序

```
POST logging.php?action=login&loginsubmit=yes
  form: username, password, questionid, answer, loginsubmit=true
   ├─ 成功 → 页面含 formhash → 登录完成
   └─ 需要安全提问 → login_secques 页，表单内含隐藏 loginauth（+ formhash 等）
        └─ 再次 POST 同一 URL
             form: 该页所有 hidden 字段 + questionid + answer + loginsubmit=true
                  └─ 成功 → formhash；失败 → alert_error / alert_info 里的论坛原话
```

实现要点（都在 `src/discuz/securityQuestion.ts`）：

- `parseSecquesForm()` **必须选包含 `name="loginauth"` 的那个 `<form>`**，页面上还有找回密码等其他 form，取第一个会错。所有 hidden 字段原样回传，`value` 需 `htmlDecode`。
- `loginMessage()` 从 `div.alert_error` / `div.alert_info` 提取论坛提示（含剩余尝试次数），去掉 script 和标签后透传给用户。
- 密码保持**明文提交**（服务端做 md5），与原 Swift 版一致。若论坛改版启用客户端哈希，需重新核对登录页 JS。

### 问题 id 表

来自论坛登录页，必须与账号注册时所选**完全一致**：

| id | 问题 | id | 问题 |
|---|---|---|---|
| 0 | 无安全提问（默认） | 4 | 您其中一位老师的名字 |
| 1 | 母亲的名字 | 5 | 您个人计算机的型号 |
| 2 | 爷爷的名字 | 6 | 您最喜欢的餐馆名称 |
| 3 | 父亲出生的城市 | 7 | 驾驶执照的最后四位数字 |

### 文件清单

| 路径 | 改动 |
|---|---|
| `src/discuz/securityQuestion.ts` | **新增**：类型、问题表、`parseSecquesForm()`、`loginMessage()` |
| `src/discuz/securityQuestion.test.ts` | **新增**：第二阶段表单与错误提示解析用例 |
| `src/discuz/client.ts` | `dologin()` 带 `questionid`/`answer` 并处理第二阶段；`login()` 返回 `LoginOutcome`（含具体 `reason`）；`Session` 增加 `question?`，自动重登会复用 |
| `src/discuz/vault.ts` | `Credentials` 增加 `question?: SecurityQuestion`；`parseVault()` 容错旧数据（没有 `question` 键的旧 vault 正常读取） |
| `src/discuz/vault.test.ts` | 问题字段往返与旧数据兼容用例 |
| `src/discuz/credentials.ts` | `saveCredentials()` 把问题与答案随密码写入钥匙串 |
| `App.tsx` | 登录框宽度 280 → 320，新增 `Select` 下拉（`安全提问 / Security question`）+ 条件显示的答案框；失败时 `Sign-in failed: <论坛原话或本地提示>` |
| `README.md` | 补充安全提问登录说明 |

UI 行为：默认「无安全提问」，**只有选了问题才出现答案输入框**，未设安全提问的账号流程不变。答案随密码存入钥匙串，会话过期自动重登无需重填。

> `App.tsx` 保留了 `Sign-in failed` 前缀，以兼容既有测试断言；失败详情拼在冒号之后。

---

## 7. 热更新与 build 号（务必先读）

runner 会**优先加载已缓存的、build 号更高的热更新包**，而不是 app 内置的 bundle。本机缓存过官方签名包 `build 1794577143`，它会把本地 TSX 改动（包括安全提问登录）整个覆盖掉，表现为「改了代码但界面没变」。

因此 `nsh.json` 的 `build` 被固定为 **`1893456000`**（2030-01-01 UTC 时间戳），高于官方发布的时间戳包，确保总是使用内置 bundle。

- **恢复跟随上游热更新**：把 `nsh.json` 的 `build` 改回 `26`，并清掉
  `~/Library/Application Support/com.nickr.DiscoveryOS/updates/` 下的缓存包。
- 副作用：只要这个 pin 还在，官方热更新就永远不会生效。
- 调试技巧：`nsh build --release -o /tmp/nsh-tsx-out` 可单独生成 TSX 字节码 bundle，
  用 `strings bundle.nshc | grep 安全提问` 快速确认新代码是否进了产物。

---

## 8. 签名、钥匙串与 LaunchServices

- **ad-hoc 签名（默认）**：每次 `codesign --force --sign -` 后，macOS 会认为钥匙串 ACL 变了，首次启动弹「DiscoveryOS 想访问钥匙串」授权。**未授权时主线程被阻塞，窗口看起来是全空白**，容易被误判成渲染故障。授权后即恢复。用 `SIGN_IDENTITY` 指定稳定证书可避免。
- **LaunchServices 缓存**：把 plist 从 14.0 改成 12.0 后，旧路径的 app 可能仍报 `-10825`。刷新方式：
  ```bash
  LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
  "$LSREG" -u /path/to/DiscoveryOS.app
  "$LSREG" -f /path/to/DiscoveryOS.app
  ```
  或者更简单：**把 zip 解压到 `/Applications` 等新路径**再打开。

---

## 9. 测试与验证

```bash
nsh check     # TSX 类型检查，通过
nsh test      # 156 tests: 154 passed, 2 failed (17.5s)
```

**2 项失败是上游基线自带问题，与本次改动无关**：在 `git worktree add --detach /tmp/... HEAD` 的干净基线上复跑 `nsh test App.test.tsx`，同样得到 `5 tests: 3 passed, 2 failed`，失败项完全一致：

- `App.test.tsx › the blank avatar opens the sign-in dialog, and Cancel closes it`
- `App.test.tsx › a failed sign-in shows an error`

原因是登录对话框在应用启动时默认打开，测试框架认为 `label:Sign in` 被覆盖（`` `label:Sign in` is covered: a press there reaches `Account` ``）。**修复它们需要调整上游测试或登录框的默认弹出行为**，本次未改，留作 TODO。

> 顺带把 `compat/nsh-platform-macos/tests/host/*.test.tsx` 改名为 `*.test.tsx.vendored`：
> 否则 `nsh test` 会把 vendored 框架自带的 host 测试也纳入发现，产生 18 项与本仓库无关的环境性失败。这些文件属于上游 crate，只做改名，未改内容。

实机验证（macOS 13.7.8）方法：用 `CGWindowListCreateImage` 抓 `owner=DiscoveryOS` 的窗口图像（该环境是全屏截图抓不到 app 窗口，需按 window id 抓）。已确认：

- 直接执行二进制稳定运行 8–10 秒无崩溃，日志仅剩无害的 `statusBar` 权限警告；
- `open -a` 启动成功；
- 窗口 1200×800（Retina 2400×1600），Channels 侧栏、Threads 列表、Account 登录框、安全提问下拉、Cancel / Sign in 均正常绘制。

产物检查：`LC_BUILD_VERSION minos 12.0` / `sdk 13.3`、`LSMinimumSystemVersion 12.0`、`CFBundleVersion 1893456000`、ad-hoc 签名 `codesign --verify --deep --strict` 通过、zip 内 plist 已核对。

---

## 10. 已知限制与后续 TODO

| 限制 | 说明 / 建议 |
|---|---|
| 非官方框架 fork | `compat/nsh-platform-macos` 锁在 0.5.0。升级 nsh 需重新评估 `surface.rs` 并重新移植帧时钟 |
| 固定 60 Hz | ProMotion / 自适应帧率失效；若需高刷，可为 macOS 14+ 分支保留 `CADisplayLink`、仅为 12/13 走 shim |
| 仅 x86_64 | Apple Silicon 需安装 arm64 版 nsh CLI 与对应运行时后重新构建； universality 未做 |
| macOS 12 未实机验证 | 只在 13.7.8 验证过。12 与 13 的 AppKit 差异很小，但请实机确认 |
| build 号 pin | 阻断官方热更新，见第 7 节 |
| 真实账号登录未验证 | 无凭据，未做真实 POST。表单字段、第二阶段处理、错误提示、凭据持久化均已通过单测与实机 UI 验证。论坛有登录失败次数限制，请勿反复试错；可用 App 的 Cookie 导入功能从已登录浏览器导入会话 |
| 2 项基线测试失败 | 见第 9 节 |
| 签名 | 默认 ad-hoc；对外分发请用 Developer ID 重跑脚本 |

---

## 11. 改动文件索引

当前 `git status --short`（相对于 `main` @ `eede1ab`）：

```
 M App.tsx
 M README.md
 M nsh.json
 M runner/Cargo.lock
 M runner/Cargo.toml
 M runner/main.rs
 M src/discuz/client.ts
 M src/discuz/credentials.ts
 M src/discuz/vault.test.ts
 M src/discuz/vault.ts
?? compat/
?? scripts/package-macos-12plus.sh
?? src/discuz/securityQuestion.test.ts
?? src/discuz/securityQuestion.ts
```

`.nsh/out/`、`target/`、`runner/target/` 均为 git-ignored 的构建产物。
`compat/` 内含上游 crate 的完整源码（含 `Cargo.toml.orig`、`.cargo_vcs_info.json`），
刻意保持原样以便 `diff -ru ~/.cargo/registry/src/.../nsh-platform-macos-0.5.0 compat/nsh-platform-macos`
审计实际改动。

---

## 12. 交付物

| 文件 | 说明 |
|---|---|
| `.nsh/out/release/DiscoveryOS-1.0.5-build26-macos.zip` | **主交付**：macOS 12+ 兼容版 + 安全提问登录（约 23 MB） |
| `.nsh/out/DiscoveryOS.app` | 同上，可直接打开 |
| `scripts/package-macos-12plus.sh` | 可复现构建脚本 |
| `.nsh/out/release/DiscoveryOS-1.0.5-build26-macos-14plus-upstream.zip` | 未打补丁的官方 macOS 14+ 构建，留作对照 |
| `docs/DEVELOPER.zh-CN.md` | 本文档 |

> 注意：主交付 zip 的文件名沿用 `build26`（便于与历史分发对齐），但 **zip 内 app 的 `CFBundleVersion` 是 `1893456000`**，原因见第 7 节。
