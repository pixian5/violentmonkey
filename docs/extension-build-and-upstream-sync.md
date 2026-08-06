# 扩展构建与上游同步说明

本文是本 fork 的操作约定。当前交付目标只有浏览器扩展，不包含 Electron 桌面主体、Safari 宿主程序或 `/Applications` 安装操作。

## 一、交付范围

扩展构建产物是仓库根目录的 `dist/`。浏览器扩展代码与 CPU 架构无关，因此不区分 ARM、Intel 或 Ubuntu 版本。

扩展日常验证只需要执行：

```sh
pnpm install --frozen-lockfile
pnpm run ci
pnpm build:extension
```

其中：

- `pnpm install --frozen-lockfile` 只安装锁定版本的依赖。
- `pnpm run ci` 执行 ESLint、YAML 检查和 Jest 测试。
- `pnpm build:extension` 生成 `dist/`，可在 Chrome/Chromium 中作为未打包扩展加载。

不要把 `pnpm ci` 当作测试命令。PNPM 的 `ci` 是安装别名；项目测试脚本的准确命令是 `pnpm run ci`。

以下命令不属于本交付范围，除非用户在单独请求中明确要求宿主程序：

```text
macos:run
macos:dev
macos:package
macos:dist
safari:package
safari:run
safari:dist
```

这些命令会触发 Electron 或 Safari 宿主相关流程，不能作为扩展构建的默认后续步骤，也不应复制到 `/Applications`。

## 二、仓库与分支关系

本仓库使用两个远端：

```text
origin  -> https://github.com/pixian5/violentmonkey
upstream -> https://github.com/violentmonkey/violentmonkey.git
```

日常工作在 `master`，完成并验证后推送 `origin/master`。上游只用于获取官方更新，不直接向上游推送。

同步前先确认工作区干净，并创建可回退的本地分支：

```sh
git status --short --branch
git fetch upstream --prune
git switch master
git branch backup/sync-$(date +%Y%m%d-%H%M%S)
git log --oneline upstream/master..HEAD
git log --oneline HEAD..upstream/master
```

`upstream/master..HEAD` 是本 fork 独有提交；`HEAD..upstream/master` 是待同步的上游提交。不要仅凭 GitHub 页面上的版本号判断是否需要同步。

## 三、推荐同步流程

### 1. 上游没有新提交

如果 `git log HEAD..upstream/master` 没有输出，不需要 rebase 或 merge。继续在当前分支开发即可。

### 2. 上游有新提交

本 fork 的提交应尽量保持小而独立，然后按以下顺序同步：

```sh
git fetch upstream --prune
git switch master
git rebase upstream/master
```

如果发生冲突，先查看冲突范围：

```sh
git status
git diff --name-only --diff-filter=U
```

解决后只加入确认过的文件，再继续：

```sh
git add <已解决的文件>
git rebase --continue
```

放弃本次同步使用：

```sh
git rebase --abort
```

rebase 成功后必须重新执行扩展验证：

```sh
pnpm install --frozen-lockfile
pnpm run ci
pnpm build:extension
git diff --check
```

由于 rebase 会改变提交 ID，确认无误后推送个人 fork：

```sh
git push --force-with-lease origin master
```

不要使用 `git push --force`，也不要在没有备份分支的情况下重写 `master`。

## 四、冲突处理原则

### `package.json` 与版本字段

本项目的扩展版本由 `package.json` 的 `version` 前两段和 `beta` 字段共同计算，具体逻辑在 `scripts/version-helper.js`。不要手工修改 `dist/manifest.json`；它是构建产物。

同步上游发生版本冲突时，先保留上游版本，再完成同步和测试，最后按本项目的版本流程递增：

```sh
pnpm bumpVersion
pnpm build:extension
```

确认以下值一致后再提交：

```sh
node -e "const p=require('./package.json'); const m=require('./dist/manifest.json'); console.log(p.version, p.beta, m.version)"
```

### `src/` 业务代码

上游同一文件有修改时，优先保留上游行为，再重新应用本 fork 的最小修复。不要把 `dist/`、`build/`、日志或本机调试输出加入提交。

### `README.md` 与 `docs/`

扩展范围说明和同步经验优先写入 `docs/`，减少反复修改上游高频变动的 README。若 README 冲突，只保留一段简短的范围指引，详细流程以本文为准。

### `.gitignore`

`.gitignore` 只存放通用本地产物规则，例如 `dist/`、`build/`、`node_modules/`、`.trae/`、缓存和日志。不要加入个人绝对路径、凭据、业务文件名或会遮蔽真实源码的宽泛规则。

### Electron 与 Safari 文件

Electron/Safari 相关目录属于已有可选特性，不是扩展日常交付的必经路径。扩展修复不应为了验证而打包宿主程序；同步上游时若这些文件产生冲突，先确认用户是否明确要求保留或更新宿主特性，再单独处理。

## 五、提交前检查清单

```sh
git status --short --branch
git diff --check
git diff --stat
pnpm run ci
pnpm build:extension
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('dist/manifest.json')); console.log(m.version, m.manifest_version)"
```

提交时只暂存本轮相关文件，使用中文提交说明：

```sh
git add <相关文件>
git commit -m '中文说明本轮扩展变更'
git push origin master
```

提交完成后再次确认：

```sh
git status --short --branch
git log -1 --oneline
```

工作区中已有的用户本地目录（例如 `.trae/`）保持忽略，不要因为同步或提交流程删除它。
