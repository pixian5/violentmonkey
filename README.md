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

- 已合并上游 2026-09-29 同步逻辑更新；Lint + 84 项自动测试、MV2/MV3 构建通过。
- 修复 `chrome.action` 包装吞掉 Promise 导致的启动异常（改为运行期补丁，不再改上游文件）。
- 完成上游补丁隔离改造：自有改动集中在 `src/fork/`，上游源码改动文件从 24 个降到 11 个，其中 5 个是单行挂点。
- 完成第二轮外挂化：导入流程（200 多行）、请求错误回调、下载修正、Safari 注入判断全部搬进 `src/fork/`，
  上游业务文件的自有代码量从约 350 行降到约 160 行；`vm-import.vue` 的 diff 从 +243 降到 +79，
  `requests.js` 从 +20 降到 +3。
- 全部挂点（含唯一无法外挂的 `sync-engine.js`）登记在挂点清单，合并上游时按清单核对即可。
- Safari 链路已验证：清单适配、宿主构建与签名、`pluginkit` 注册均通过。
- [查看挂点清单](docs/20261009003600-外挂式补丁层挂点清单.md)
- [查看上一轮进度](docs/20260930014200-上游补丁隔离改造.md)

## 下一步待实现

- 给上游提 PR：授权流程竞态修复（`sync-engine.js`）与 `zipTimeToDate` 运算符优先级错误，
  上游合入后本地这两处挂点即可删除。
- Safari 打包（`safari/scripts/package-safari.mjs`）走 Xcode 自动签名会内嵌 7 天描述文件；
  可以在打包后去掉描述文件重签，`.app`/`.appex` 不需要它。
- 在隔离测试账户验证新同步逻辑，并在 Safari 内验证真实网页注入。
- 归档或删除已过时的 `qwen开发方案.md`、`seed开发方案.md`（基于上游 2.46.4 / 自有 0.0.4，
  与现在的 2.49.0 / 0.0.9 路线不符）。
- [查看挂点清单](docs/20261009003600-外挂式补丁层挂点清单.md)
- [查看上游合并与外挂式方案分析](docs/20260929235346-上游同步与外挂式方案分析.md)

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
