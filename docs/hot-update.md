# TSX 热更新设计

状态：设计稿，未实现。

## 1. 目标与范围

- **目标**：只改 TSX / 资源（不改 Rust）时，用户不用重新安装 App，重启后即生效。
- **非目标**：Rust 代码热更（`src/*.rs`，即 `discoveryos/native` 原生模块）；静默替换 `.app` 二进制；运行中不重启切换（见 §8）。

依据：最近 30 次提交里，约 105 个 `ts/tsx` 文件变更，`rs` 文件只出现在 5 次变更中，TSX 热更覆盖的是主要改动类型。

## 2. 已核实的 NSH 能力

来源：本机 `nsh` CLI 0.3.x 与 crates `nsh-package`、`nsh-engine`、`nsh-macos-app` 源码。

| 能力 | 位置 | 对设计的影响 |
|---|---|---|
| 签名包 `.nshpkg`：bundle.js、可选 bytecode、source map、assets、capabilities、`min_runtime` | `nsh-package::build` | 更新单元就是一个包 |
| 两阶段加载：`verify_package`（不记录 build）→ 运行 → `accept_package`（记录 build） | `nsh-engine` `lib.rs` | 可以实现"试运行，健康后再接受"，失败时回退 |
| build 单调递增，比已接受的 build 小的包被拒绝 | `TrustStore::verify` | 防止回滚到有漏洞的旧 TSX |
| 吊销列表：root 签名，只接受更新的序号 | `TrustStore::update_revocations` | 能紧急作废某个包或某个发布密钥 |
| `policy.declared` 来自包内 capabilities；`policy.granted` 是宿主授予的上限 | `Policy::access` | **宿主必须设置 `granted`** 为内置 `nsh.json` 的 capabilities，否则包可以自行声明更大的网络白名单 |
| bytecode 只在 `BYTECODE_VERSION` 相同时保留，否则退回 JS 源码 | `Bundle::from_package` | 无需额外处理，源码始终可用 |
| 发布版 runner（`nsh-macos-app::main`）只加载内置 `bundle.nshc` | `nsh-macos-app/src/lib.rs` | **需要自定义 runner 入口**，这是最大的未验证点（见 §9） |
| CLI：`keygen` / `certify` / `publish` / `verify` / `revoke` | `nsh --help` | 签名链路现成可用 |

## 3. 信任模型

```
root 私钥（离线保存）
  └─ certify ──> release 私钥（CI 或本机使用，有效期默认 365 天）
                  └─ publish ──> .nshpkg（签名 + 证书 + 文件哈希）
root 公钥 .pub：编译进 App（唯一信任锚）
```

- 根公钥在 runner 里硬编码，`TrustStore::new()` + `add_root()`。
- 吊销列表由 root 签名，随更新清单下发，启动时 `update_revocations`。
- release 密钥轮换：用同一个 root `certify` 新密钥即可，已安装的 App 不需要更新。

## 4. 架构

```
┌─────────── 启动（自定义 runner，Rust）───────────┐
│ 1. 读内置 bundle.nshc，内置 build = nsh.json.build │
│ 2. 选择候选（纯函数，见下）：                       │
│    staged 包 → lastGood 包 → 内置 bundle          │
│ 3. verify_package(trust, bytes, assets_root)      │
│    - 检查 compat.json（nativeApi 版本）             │
│    - 检查 package.build > 内置 build               │
│ 4. 写 pending.json（记录候选 sha256）              │
│ 5. run_app(AppSource::Bundle(bundle))             │
│    policy.granted = 内置 capabilities             │
└──────────────────────────────────────────────────┘
          │ 首屏健康（首帧 + N 秒无致命错误）
          ▼
   accept_package → lastGood = sha256 → 清除 pending.json
          │ 崩溃/致命错误（下次启动时仍有 pending.json）
          ▼
   把该 sha256 记入 bad 列表 → 回退到 lastGood / 内置
```

**候选选择**（纯函数，便于单测）：

```
choose(embeddedBuild, staged, lastGood, bad, accepted) -> Candidate
  - 跳过 bad 中的 sha256
  - 只考虑 build > embeddedBuild 的包（重装更新的完整 App 后，旧的热更包自动失效）
  - staged 优先，其次 lastGood，否则内置
```

**存储布局**（App 数据目录，沙盒内）：

```
updates/
  staging/<sha256>.nshpkg   下载的包（未验签）
  trust/                    TrustStore::open 的状态（已接受的 build、吊销列表）
  assets/                   verify_package 写入的资源
  state.json                pending / lastGood / bad
```

**下载**（TSX 或 Rust 均可，验签不依赖它）：

1. 请求更新清单（HTTPS，域名加入 `nsh.json` `capabilities.network.hosts`）。
2. 清单 build > 当前候选 build 时，下载到 `staging/<sha256>.tmp`，校验 sha256 后原子 rename。
3. 提示"重启以应用"。

## 5. 更新清单

```json
{
  "id": "com.nickr.DiscoveryOS",
  "build": 12,
  "version": "1.0.3",
  "url": "https://<host>/packages/12.nshpkg",
  "sha256": "<hex>",
  "revocations": "https://<host>/revocations.json"
}
```

- 清单本身不可信：它只决定"去下载什么"。篡改清单最多造成下载或拒绝，无法让未签名代码运行。
- TSX 侧解析清单时用 Zod 校验（安全规则要求）。

**兼容性（nativeApi）**：TSX 可能引用 Rust 原生模块。包内放一个签名资源 `compat.json`（`{"nativeApi": 2}`），runner 里有常量 `NATIVE_API`。原生模块接口变化时递增；包的 nativeApi 大于运行时则拒绝。资源随包哈希签名，无法被篡改。

## 6. 安全检查清单

- 只允许 HTTPS，域名白名单。
- 验签、证书有效期、吊销、哈希、build 单调递增，全部由 `verify_package` 完成，不在 TSX 里做判断。
- 下载文件只写入 `staging/`，不直接执行。
- bytecode 只来自已验签的包（`Bundle::from_package`），不调用 `Bundle::read`。
- 日志不记录 URL 参数、用户名、邮箱等 L3/L4 数据；错误信息面向用户时保持通用。
- 允许用户关闭自动检查（设置项）。

## 7. 分阶段计划

- **P0 验证（先做，决定方案是否可行）**
  - 写一个自定义 runner，能用 `verify_package` 加载外部 `.nshpkg`。
  - 确认 `nsh publish` / `nsh package --target macos` 能否使用自定义 runner（§9 第 1 条）。
  - 确认 TSX 侧的网络 API 能下载二进制文件。
- **P1 签名链路**
  - `nsh keygen` 生成 root 与 release 密钥；root 离线保存。
  - `nsh certify`、`nsh publish --build N`，生成测试包。
  - 测试：篡改包失败；build 回滚被拒；`granted` 限制生效；崩溃后回退到上一个可用包。
- **P2 客户端**
  - 候选选择纯函数 + 单测。
  - 清单获取、下载、staging、"重启以应用"提示。
- **P3 发布**
  - CI 中 `nsh publish` + 上传清单；吊销流程与 release 密钥轮换的操作手册。

## 8. 不做的事（及理由）

- **运行中切换**：`AppSource` 只在启动时选定，运行中替换 bundle 需要宿主支持。默认重启生效，后续可再评估。
- **Rust 热更**：必须走完整发版，即重新安装。
- **静默替换二进制**：沙盒限制大，且需要 Sparkle 式机制。

## 9. 决定与待确认的问题

已决定：
- **更新源：GitHub Releases**。清单（`latest.json`）和 `.nshpkg` 都作为 release 资产。`fetch` 会对每次重定向重新检查白名单，因此需要同时加入 `github.com` 与 `objects.githubusercontent.com`。仓库需要公开，否则 App 无法在不带 token 的情况下下载。
- **root 私钥：本机保管**。注意：nsh 的签名密钥是 Ed25519（`nsh keygen` 生成），验签代码只接受 Ed25519，不能使用现有的 RSA 私钥。

已确认：
- **TSX 侧能下载二进制**：现有代码 `src/ui/downloads.ts` 已经用 `fetch` + `arrayBuffer()` + `writeFile` 保存附件。

待确认：
1. **自定义 runner 的接入方式**（最大风险）：`nsh package` 的发布包内置的是通用 runner，它只加载包内的 `bundle.nshc`。需要验证带 `nsh.json` `"rust": "."` 的 App 能否提供自己的 runner 入口（`main` 调用 `verify_package` 后再 `run_app`）。P0 第一步验证这一点。
2. **自动检查频率与用户开关**。

## 10. 测试策略

- Rust：候选选择纯函数的单测；`verify_package` 对篡改/回滚/吊销/nativeApi 不匹配的用例。
- TSX：`nsh test`（headless）覆盖清单解析、"有更新"判断、提示状态。
- 手动：在模拟器外用 `nsh run` 加载测试包，检查重启后生效与崩溃回退。
