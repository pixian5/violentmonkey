# Violentmonkey

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/jinjaccalgkegednnccohejagnlnfdag.svg)](https://chrome.google.com/webstore/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag)
[![Firefox Add-ons](https://img.shields.io/amo/v/violentmonkey.svg)](https://addons.mozilla.org/firefox/addon/violentmonkey)
[![Microsoft Edge Add-on](https://img.shields.io/badge/dynamic/json?label=microsoft%20edge%20add-on&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Feeagobfjdenkkddmbclomhiblgggliao)](https://microsoftedge.microsoft.com/addons/detail/eeagobfjdenkkddmbclomhiblgggliao)

Violentmonkey provides userscripts support for browsers.
It works on browsers with [WebExtensions](https://developer.mozilla.org/en-US/Add-ons/WebExtensions) support.

## Current Build Scope

The current deliverable is the browser extension only. The required build and
verification commands are `pnpm run ci` and `pnpm build:extension`, which produce
the extension in `dist/`. Do not run `macos:*`, `safari:*`, Electron packaging,
or host-app installation unless a separate request explicitly asks for a host
application.

## 当前开发进度

- **修复「Safari 点弹窗菜单全部无响应」**（工程 0.1.2）：根因是 Safari 的
  `permissions.contains({permissions:['downloads']})` **同步抛错**，而上游 `permissions.js`
  在模块顶层调用它，未捕获异常炸掉整个后台 bundle，`runtime.onMessage` 从未注册。
  修复后弹窗不再显示红色堆栈，齿轮可开管理面板、+ 可进编辑器、设置页可交互、启用开关生效。
  [查看排查过程](docs/20261122-2345-Safari弹窗菜单无响应根因定位与修复-Claude-Sonnet-4.5.md)
- 新增 `src/fork/guard.js`：`safePatch` / `trySet` / 早期异常捕获（崩溃栈写入 `localStorage['fork:log']`），
  让单个补丁失败不再牵连整个后台；`src/fork/diagnostics.js` 增加 init 看门狗与命令级错误日志。
- `src/fork/log.js`（新增）：后台日志落入 localStorage，弹窗同源可读，Safari 无 devtools 时的取证通道。
- 修正三处回调丢失（`storage.local.get`、`tabs.query`、async stub）与 `windows.getAll()` 返回值规整；
  新增 `tabs.create` 降级重试（逐级剔除 Safari 不支持的 `openerTabId` / `cookieStoreId` / `index`）。
- Node 严格 mock 双向对照：旧产物 **0/7**（全超时）→ 新产物 **6/7**；Safari 实机全部菜单入口验证通过。
- 已合并上游 `v2.49.4`（4 个新提交，含 `background/sw.js` 改动）**零冲突**，
  五个入口挂点全部保留；合并后 Lint、84 项测试、MV2/MV3 构建复验通过。
- Safari 链路已验证：清单适配、宿主构建与签名、`pluginkit` 注册均通过。
- 修复「Safari 里看不到扩展」：`package-safari.mjs` 原先**只构建不安装**，`/Applications` 长期留着
  8-04 的 adhoc 旧包（Safari 不接受无团队签名）；现已补 `installHostApp()`（安装+签名校验+清理构建
  副本+重注册），`run-safari.mjs` 改为从 `/Applications` 启动。
  [查看排查过程](docs/20261009-0055-Safari扩展消失根因与安装步骤补齐-GPT-6.md)
- 新增用户脚本 `脚本/github链接新标签打开.js`（v1.0.1）：在 github.com / *.github.com 所有页面
  左键单击链接强制新标签打开，捕获阶段事件委托兼容 SPA，排除锚点/中键/修饰键/已有 target=_blank；
  Releases 附件、codeload 源码归档、带 download 属性的链接保持当前页下载。
  [查看操作记录](docs/20261014-1651-GitHub新标签脚本新增-Doubao.md)
- 清理 `/Applications` 里 8-06 手动安装遗留的 3 个 `Violentmonkey.app.backup-*`（约 800MB），
  桌面壳重打包到 2.49.0（`pnpm macos:dist`）并重新安装，签名校验、窗口启动均通过。
  [查看操作记录](docs/20261030-1836-桌面壳清理与重打包至2.49.0-DeepSeek-V4.1-Flash.md)
- [查看本轮进度详情](docs/20261122-2350-当前开发进度-Claude-Sonnet-4.5.md)
- [查看挂点清单](docs/20261009-0036-外挂式补丁层挂点清单-GPT-6.md)
- [查看文档索引](文档索引.md)

## 下一步待实现

- **验证 Safari 脚本注入链路**：`tabs.executeScript` / `insertCSS` / `removeCSS` 在 Safari 上是只读成员，
  现有 `patchExecuteScript` 实际写不进去（日志有「属性写入无效」）。需在真实网页安装一个用户脚本确认注入是否成功；
  若失败，改为在调用点（`browser-scripts-api.js` MV2 分支）适配。
- 把 `tabs.create` 统一为 Promise 式单次降级：当前回调式分支在失败时可能重复尝试。
- 验证 Safari 回收后台进程后，`init` 能否重新完成、弹窗能否自动恢复。
- 给上游提 PR：授权流程竞态修复（`sync-engine.js`）与 `zipTimeToDate` 运算符优先级错误，
  上游合入后本地这两处挂点即可删除。
- Safari 打包（`safari/scripts/package-safari.mjs`）走 Xcode 自动签名会内嵌 7 天描述文件；
  可以在打包后去掉描述文件重签，`.app`/`.appex` 不需要它。
- 归档或删除已过时的 `qwen开发方案.md`、`seed开发方案.md`（基于上游 2.46.4 / 自有 0.0.4，
  与现在的 2.49.0 / 0.1.x 路线不符）。
- [查看本轮待办详情](docs/20261122-2350-下一步待实现-Claude-Sonnet-4.5.md)
- [查看挂点清单](docs/20261009-0036-外挂式补丁层挂点清单-GPT-6.md)
- [查看上游合并与外挂式方案分析](docs/20260929-2353-上游同步与外挂式方案分析-GPT-6.md)

More details can be found [here](https://violentmonkey.github.io/).

Join our Discord server:

[![Discord](https://img.shields.io/discord/995346102003965952?label=discord&logo=discord&logoColor=white&style=for-the-badge)](https://discord.gg/XHtUNSm6Xc)

## Automated Builds for Testers

* [CI workflows](https://github.com/violentmonkey/violentmonkey/actions/workflows/ci.yml) (only for signed-in github.com users)
* [nightly.link latest](https://nightly.link/violentmonkey/violentmonkey/workflows/ci/master?preview) (to download any other build replace `github.com` with `nightly.link` in the artifact URL)

A test build is generated automatically for changes between beta releases. It can be installed as an unpacked extension in Chrome and Chromium-based browsers or as a temporary extension in Firefox. It's likely to have bugs so do an export in Violentmonkey settings first. This zip is available only if you're logged-in on GitHub site. Open an entry in the [CI workflows](https://github.com/violentmonkey/violentmonkey/actions/workflows/ci.yml) table and click the `Violentmonkey-...` link at the bottom to download it.

## Workflows

### Development

Install [Node.js](https://nodejs.org/) and PNPM.
The version of Node.js should match `"node"` key in `package.json`.
This project is pinned to the pnpm version in the `"packageManager"` field.

``` sh
# Install dependencies
$ pnpm install

# Watch and compile
$ pnpm dev
```

Then load the extension from 'dist/'.

### Test + lint

``` sh
$ pnpm run ci
```

### Build

To release a new version, we must build the assets and upload them to web stores.

``` sh
# Build for normal releases
$ pnpm build

# Build for self-hosted release that has an update_url
$ pnpm build:selfHosted
```

### Optional macOS Desktop Host

This repository also contains an optional Electron-based macOS shell. It is
not part of the extension-only build scope and does not need to be built,
installed, or tested for normal extension work.

``` sh
# Install dependencies
$ pnpm install

# Run the desktop shell locally
$ pnpm macos:dev

# Package a macOS .app in build/macos/
$ pnpm macos:dist
```

If a local code-signing certificate is available in Keychain, the packaging
script will try to sign the app automatically. Otherwise it will build an
unsigned app bundle.

### Safari Build

Safari packaging uses Apple's Web Extension converter plus Xcode.

``` sh
# Build a Safari-compatible extension bundle and host app
$ pnpm safari:dist

# Launch the Safari host app the correct way so macOS registers the extension
$ pnpm safari:run
```

The generated Safari host app is placed in `build/safari/DerivedData/Build/Products/Debug/`.

Do not launch `ViolentmonkeySafari.app/Contents/MacOS/ViolentmonkeySafari` directly.
On recent macOS versions this may skip the normal app registration flow, so Safari
won't list the extension even though the build succeeded. `pnpm safari:run` opens
the `.app` bundle via LaunchServices, stops any old host process, and waits until
`pluginkit` reports the Safari extension as registered.

### Release

See [RELEASE](RELEASE.md) for the release flow.

## Related Projects

- [Violentmonkey for Opera Presto](https://github.com/violentmonkey/violentmonkey-oex)
- [Violentmonkey for Maxthon](https://github.com/violentmonkey/violentmonkey-mx)
