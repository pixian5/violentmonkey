# macOS 桌面包（Electron 壳）打包与安装

## 结论

- 桌面包只是可选宿主，交付物是浏览器扩展；只有用户明确要求时才跑 `pnpm macos:dist`。
- 打包命令：`pnpm macos:dist`（= `build:extension` + `electron/scripts/package-macos.mjs`），产物落在
  `build/macos/mac-<arch>/Violentmonkey.app`，脚本**不会**自动装进 `/Applications`。
- 安装要手动做：先 `pkill` 旧进程 → `rm -rf /Applications/Violentmonkey.app` → `ditto` 新包过去。

## 版本号会“对不上”，不是 bug

| 位置 | 来源 | 本轮实际值 |
|---|---|---|
| `Contents/Info.plist` 的 `CFBundleShortVersionString` | `package.json` 的 `version` | 2.49.0 |
| 内置扩展 `Resources/dist/manifest.json` | `scripts/version-helper.js`：`version 前两位 + beta` | 2.49.4 |

`package.json` 里 `"beta": 4` 时扩展版本自然是 `2.49.4`，不要误判为打包用了旧产物。

## 坑

- **不要在 `/Applications` 里留 `.backup-*`**：改名留底的旧包每个约 267MB，8-06 那轮就攒了 3 个（约 800MB）。
  回退需求放 `build/` 下即可，`/Applications` 只留一份正在用的。
- 旧包若缺 `_CodeSignature`（adhoc），Safari/系统会不认；重新打包时用本机 `Apple Development` 身份签名即可，
  `package-macos.mjs` 会自动探测 `security find-identity`。
- 打包会从 GitHub 下载约 107MB 的 Electron 包（`build/macos` 已有缓存时不重复下载），
  流量敏感时先确认网络（热点环境要先问）。
- 校验顺序：版本号 → `codesign -v --deep --strict` → `open -a` → 用 AppleScript 确认窗口真的起来了，
  只看到进程存在不代表界面加载成功。
