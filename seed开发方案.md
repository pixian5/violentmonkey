# Seed 开发方案 - Violentmonkey 定制版

## 一、项目概述

### 1.1 项目定位
本项目是 [Violentmonkey](https://github.com/violentmonkey/violentmonkey)（暴力猴）浏览器扩展的 fork 版本，在保持上游核心功能的基础上，进行个性化定制和功能增强。Violentmonkey 是一款开源的用户脚本管理器，支持 Chrome、Firefox、Edge 等主流浏览器，同时提供 Electron 桌面端和 Safari 扩展支持。

### 1.2 当前版本信息
- **上游版本**：2.46.4
- **自定义版本**：0.0.4（VERSION 文件）
- **Beta 序号**：6
- **Manifest 版本**：2（同时支持 MV3 构建）
- **Git 仓库**：https://github.com/pixian5/violentmonkey
- **上游仓库**：https://github.com/violentmonkey/violentmonkey

### 1.3 已有的定制功能
- X（Twitter）自动转帖 + 转帖后自动点赞脚本（v4.0.4）
- LINUX DO 外链自动继续脚本
- Electron macOS 桌面应用支持
- Safari 扩展打包支持
- 多语言支持（30+ 语言）
- 云同步支持（Dropbox、Google Drive、OneDrive、S3、WebDAV）

---

## 二、技术栈分析

### 2.1 核心技术栈

| 类别 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| **前端框架** | Vue.js | 3.5.40 | Options API 风格 |
| **代码编辑器** | CodeMirror | 5.65.20 | 脚本编辑核心 |
| **UI 组件库** | vueleton | 2.0.2 | 轻量 UI 组件 |
| **构建工具** | Webpack | 5.109.0 | 模块打包 |
| **任务运行器** | Gulp | 5.0.1 | 构建流程编排 |
| **包管理器** | pnpm | 11.17.0 | 强制使用 |
| **Node.js** | - | ≥ 24 | 运行时要求 |
| **测试框架** | Jest | 30.4.2 | 单元测试 |
| **代码检查** | ESLint + Prettier | 8.57.1 / 3.8.3 | 代码规范 |
| **桌面端** | Electron | 35.0.0 | macOS 应用 |
| **桌面打包** | electron-builder | 25.1.8 | .app 打包 |
| **图标处理** | Sharp | 0.34.5 | 图标生成 |
| **压缩工具** | fflate | 0.8.3 | 数据压缩 |
| **域名解析** | tldts | 7.4.9 | TLD 解析 |

### 2.2 项目架构

```
violentmonkey/
├── src/
│   ├── background/          # 后台脚本（核心逻辑）
│   │   ├── plugin/          # 插件系统
│   │   ├── sync/            # 云同步引擎
│   │   └── utils/           # 后台工具函数
│   ├── common/              # 公共模块
│   │   └── ui/              # Vue UI 组件
│   ├── injected/            # 注入脚本（3层架构）
│   │   ├── web/             # 页面上下文（Isolated World 外）
│   │   ├── content/         # 内容脚本（Isolated World）
│   │   └── util/            # 注入工具
│   ├── options/             # 设置/管理页面
│   ├── popup/               # 弹出窗口
│   ├── confirm/             # 确认对话框页面
│   └── offscreen/           # MV3 Offscreen Document
├── electron/                # Electron 桌面端
│   ├── main.js              # 主进程
│   ├── preload.js           # 预加载脚本
│   └── renderer/            # 渲染进程
├── safari/                  # Safari 扩展
├── scripts/                 # 构建脚本
├── _locales/                # 国际化文件（30+ 语言）
├── userscripts/             # 预置用户脚本
├── 脚本/                    # 自定义用户脚本（中文目录）
└── test/                    # 测试用例
```

### 2.3 关键架构特点

1. **三层注入架构**：
   - `injected-web.js`：注入到页面真实上下文，提供 GM_* API 包装
   - `injected.js`：内容脚本层，处理消息通信
   - 通过 CustomEvent 和 postMessage 进行跨上下文通信

2. **后台脚本模式**：
   - MV2：传统 background page（多脚本列表）
   - MV3：Service Worker + Offscreen Document

3. **构建时常量注入**：
   - 通过 Webpack DefinePlugin 注入到 `__` 对象
   - 禁止源码直接使用 `process.env`

4. **用户脚本沙箱**：
   - 安全的全局环境隔离
   - GM_* API 实现（GM_info、GM_getValue、GM_setValue、GM_xmlhttpRequest 等）

---

## 三、当前项目状态评估

### 3.1 优点分析

✅ **代码质量较好**：
- 有完整的 ESLint 配置和测试覆盖
- 上游项目成熟稳定，代码经过大量验证
- 使用 TypeScript 类型定义（@types/chrome 等）

✅ **构建体系完善**：
- Gulp + Webpack 组合，支持开发/生产模式
- 支持 MV2/MV3 双版本构建
- 自动图标生成、国际化处理
- 支持 Chrome/Firefox/Edge/Safari/Electron 多目标

✅ **多端支持**：
- 浏览器扩展（主交付物）
- Electron macOS 桌面应用
- Safari 扩展（通过 Xcode 转换）

✅ **功能完整**：
- 脚本安装/编辑/管理
- 云同步（5 种云存储）
- 脚本自动更新
- 黑白名单
- 脚本导入/导出
- 快捷键支持

✅ **已有定制基础**：
- X 自动转帖+点赞脚本已完善（v4.0.4），有回归测试
- 构建流程已修复并文档化
- 上游同步流程已明确

### 3.2 存在的问题与风险

⚠️ **版本管理混乱**：
- `package.json` 版本（2.46.4）与 `VERSION` 文件（0.0.4）不一致
- manifest 版本是动态计算的（package.version + beta）
- 缺乏清晰的自定义版本号管理策略

⚠️ **用户脚本管理不规范**：
- `userscripts/` 和 `脚本/` 两个目录存放用户脚本，位置不统一
- 脚本版本号独立管理，没有与扩展版本联动
- 预置脚本没有自动更新机制

⚠️ **Electron 桌面端功能简单**：
- 当前仅作为浏览器外壳，没有深度集成
- 没有原生菜单/快捷键与脚本联动
- 没有应用内脚本商店/发现功能
- 没有自动更新机制

⚠️ **测试覆盖不足（自定义部分）**：
- 上游测试完善，但自定义脚本测试较少
- X 脚本有一个测试，其他脚本无测试
- 没有端到端（E2E）测试

⚠️ **开发体验可改进**：
- 热重载需要手动刷新扩展
- 没有一键开发环境启动脚本
- 调试配置需要手动设置

⚠️ **文档分散**：
- 构建说明在 README 和 docs/ 中重复
- 上游同步流程只在 docs/ 中
- 没有完整的二次开发指南

⚠️ **CI/CD 不完善（个人 fork）**：
- GitHub Actions 是上游配置，没有针对个人定制的部署流程
- 没有自动构建桌面应用并发布的流程
- 没有自动同步上游的检查机制

---

## 四、开发建议与路线图

### 4.1 短期改进（1-2 周）- 基础建设

#### 4.1.1 版本管理统一
**目标**：建立清晰的版本号管理体系

**建议方案**：
- 保留 `package.json` 版本用于追踪上游版本
- `VERSION` 文件作为自定义修订号（0.0.4 → 每次自定义修改加 0.0.1）
- 在 `scripts/version-helper.js` 中增加自定义版本组合逻辑
- 在 UI 中同时显示上游版本和自定义版本（如 "2.46.4-seed0.0.4"）
- 每次提交前自动更新版本号

#### 4.1.2 用户脚本管理规范化
**目标**：统一用户脚本存放和管理

**建议方案**：
- 将中文目录 `脚本/` 重命名或合并到 `userscripts/`，或统一使用 `seed-userscripts/`
- 为每个预置脚本添加完整的元数据（@version、@author、@description、@updateURL）
- 在扩展设置中增加"预置脚本"分类，方便管理
- 考虑为预置脚本提供内置更新检查
- 建立脚本开发模板和规范

#### 4.1.3 开发环境优化
**目标**：提升开发效率

**建议方案**：
- 添加 `.vscode/` 推荐配置（launch.json、settings.json）
- 创建一键启动脚本：`pnpm dev:chrome`（自动打开 Chrome 加载扩展）
- 完善开发文档，包括调试技巧
- 考虑添加 web-ext 或类似工具实现自动重载
- 添加 git hooks（已有 husky，但 pre-push 可增强）

#### 4.1.4 文档完善
**目标**：清晰的二次开发文档

**建议方案**：
- 创建 `docs/DEVELOPMENT-SEED.md` 专门记录定制开发流程
- 整理架构说明文档
- 添加常见问题（FAQ）
- 记录已知问题和 workaround

### 4.2 中期改进（1-2 个月）- 功能增强

#### 4.2.1 Electron 桌面端深度集成
**目标**：打造独立的桌面应用体验

**功能建议**：
- **应用内浏览器**：当前已有基础，增强标签页管理
- **脚本中心**：内置脚本市场/推荐列表
- **全局快捷键**：系统级快捷键触发常用操作
- **菜单栏图标**：macOS 菜单栏快速访问
- **通知中心**：整合脚本通知
- **自动更新**：使用 electron-updater 实现自动更新
- **数据备份**：定时自动备份脚本和配置
- **AppleScript 支持**：与系统其他应用联动

**技术改进**：
- 分离主进程和渲染进程代码
- 添加进程间通信（IPC）类型定义
- 完善应用菜单和 Dock 菜单
- 添加崩溃报告和日志收集

#### 4.2.2 预置脚本生态建设
**目标**：打造实用的脚本集合

**建议脚本开发**：
- **社交媒体自动化**：增强 X 脚本，添加微博、小红书、抖音等平台
- ** productivity 工具**：网页增强、阅读模式、视频下载辅助
- **开发工具**：API 调试、JSON 格式化、页面元素检查
- **购物助手**：价格追踪、优惠券自动查找
- **广告过滤增强**：配合自定义规则
- **网页翻译增强**：集成多翻译引擎

**脚本管理功能**：
- 脚本一键启用/禁用
- 脚本配置面板（GM_registerMenuCommand 增强）
- 脚本运行统计（运行次数、耗时）
- 脚本冲突检测
- 脚本权限可视化

#### 4.2.3 同步功能增强
**目标**：更可靠的数据同步

**改进建议**：
- 添加 WebDAV 同步的更详细配置（自定义路径、认证方式）
- 增加本地文件系统同步（Electron 端）
- 同步冲突解决 UI（当前是自动合并）
- 同步历史记录和回滚
- 端到端加密选项
- 增量同步优化

#### 4.2.4 UI/UX 改进
**目标**：更现代的用户界面

**改进方向**：
- 升级 CodeMirror 5 → CodeMirror 6（性能更好、模块化）
- 考虑升级 Vue 3 组件库或自定义设计系统
- 深色/浅色主题切换（当前有基础，可增强）
- 脚本编辑器增强：多光标、Vim 模式、代码片段
- 仪表板 redesign：更直观的脚本状态展示
- 搜索功能增强：全文搜索脚本内容

### 4.3 长期规划（3-6 个月）- 平台化

#### 4.3.1 脚本商店/平台
**目标**：建立脚本分发平台

**功能规划**：
- 自建脚本仓库（或对接 Greasy Fork/OpenUserJS API）
- 脚本评分、评论、截图
- 脚本版本管理和更新通道（稳定版/测试版）
- 开发者后台：脚本上传、统计分析
- 安全扫描：自动检测恶意脚本

#### 4.3.2 高级功能
**目标**：差异化竞争力

**功能建议**：
- **脚本录制器**：可视化录制网页操作生成脚本
- **AI 辅助编写**：集成 LLM 帮助编写/调试脚本
- **规则引擎**：可视化条件编辑，无需写代码
- **多账户隔离**：不同浏览器环境/配置文件
- **远程调试**：在桌面端调试移动端页面脚本
- **网络抓包集成**：内置 DevTools 增强
- **脚本性能分析**：检测慢脚本、内存泄漏

#### 4.3.3 跨平台扩展
**目标**：覆盖更多平台

**平台规划**：
- Windows/Linux Electron 应用（当前只配置了 macOS）
- iOS 应用（通过 Safari Web Extension）
- Android 应用（需要考虑 Firefox/Chrome 扩展支持）
- 浏览器内置 DevTools 插件

---

## 五、技术改进建议

### 5.1 代码质量

1. **TypeScript 迁移**：
   - 先从新代码开始使用 TypeScript
   - 逐步迁移核心模块（sync、background/utils）
   - 配置好 tsconfig.json，当前已有基础

2. **测试增强**：
   - 提高自定义代码的测试覆盖率到 80%+
   - 添加 E2E 测试（Playwright）
   - 添加性能基准测试
   - 预置脚本添加 DOM 测试

3. **代码规范**：
   - 考虑添加 Stylelint 检查 CSS/Vue 样式
   - 完善 git commit 规范（conventional commits）
   - 添加 Spell Check 避免拼写错误

### 5.2 构建优化

1. **构建速度**：
   - 评估迁移到 Vite 或 Rspack 的可行性
   - 优化 webpack 缓存配置
   - 并行构建多目标

2. **产物优化**：
   - 分析 bundle 大小，拆分大依赖
   - CodeMirror 按需加载语言模式
   - 预压缩 gzip/brotli

3. **Source Map**：
   - 开发环境完整 Source Map
   - 生产环境 hidden Source Map 便于调试

### 5.3 安全增强

1. **脚本沙箱加固**：
   - 审计 GM_* API 的安全边界
   - 添加 CSP（内容安全策略）
   - 可疑脚本行为检测和告警

2. **权限管理**：
   - 细化脚本权限提示
   - 权限可视化界面
   - 临时授权机制

3. **更新安全**：
   - 脚本更新签名验证
   - 自动更新前 diff 展示
   - 回滚机制

### 5.4 性能优化

1. **启动性能**：
   - 后台脚本懒加载
   - 非关键模块延迟初始化
   - 预热常用脚本缓存

2. **运行时性能**：
   - MutationObserver 节流/防抖
   - 大脚本编译缓存
   - Web Worker 处理重任务

3. **内存管理**：
   - 定期清理孤立的 iframe
   - WeakMap/WeakSet 使用审计
   - 页面卸载时彻底清理注入

---

## 六、具体实施方案

### 6.1 第一阶段：基础夯实（立即开始）

**任务清单**：

- [ ] 版本管理统一
  - 修改 `scripts/version-helper.js` 支持自定义版本后缀
  - 在 UI about 页面显示完整版本号
  - 编写版本号管理规范文档

- [ ] 用户脚本目录统一
  - 将 `脚本/` 目录移动到 `seed-userscripts/` 或合并到 `userscripts/`
  - 为每个脚本添加完整元数据头
  - 创建脚本开发模板

- [ ] 完善开发工具链
  - 添加 VS Code 配置（.vscode/）
  - 创建 `pnpm dev:chrome` 辅助脚本
  - 添加扩展调试说明文档

- [ ] 修复已知小问题
  - 检查并修复当前 open 的 issues（如果有）
  - 运行完整测试套件确保基线正确
  - 更新 .gitignore 清理不必要文件

**验收标准**：
- `pnpm run ci` 全部通过
- `pnpm build:extension` 正常生成
- 版本号显示正确
- 开发流程有文档可依

### 6.2 第二阶段：桌面端增强（2 周后）

**任务清单**：

- [ ] Electron 应用完善
  - 完善应用菜单（编辑、视图、窗口等标准菜单）
  - 添加 Dock 菜单和 Touch Bar 支持
  - 窗口状态记忆（位置、大小）
  - 应用内协议处理（violentmonkey://）

- [ ] 脚本管理增强
  - 在桌面端添加脚本导入/导出快捷键
  - 最近打开的脚本列表
  - 脚本文件夹分类功能

- [ ] 打包配置完善
  - 配置 electron-builder 自动更新
  - 添加 DMG 打包格式
  - 代码签名和公证（如果有开发者账号）

**验收标准**：
- `pnpm macos:dist` 生成可运行的 .app
- 复制到 /Applications 能正常启动
- 基本功能可用

### 6.3 第三阶段：功能迭代（持续进行）

**任务清单**：根据优先级逐个实现以下功能：

1. 脚本编辑器增强（CodeMirror 升级或主题优化）
2. X 脚本功能增强（评论转发、自动回复等）
3. 更多实用预置脚本
4. 同步功能改进
5. UI 主题和交互优化

每个功能都应：
- 先写设计文档
- 实现后添加测试
- 更新文档
- 提交前完整验证

---

## 七、开发流程规范

### 7.1 日常开发流程

```bash
# 1. 确保在 master 分支，工作区干净
git status
git checkout master
git pull origin master

# 2. 创建功能分支（可选，小改动可直接在 master）
git checkout -b feature/xxx

# 3. 安装依赖
pnpm install --frozen-lockfile

# 4. 开发模式
pnpm dev

# 5. 在 Chrome 中加载 dist/ 目录调试

# 6. 代码检查和测试
pnpm run ci

# 7. 构建验证
pnpm build:extension

# 8. 更新版本号（每次自定义修改）
# 修改 VERSION 文件（+0.0.1）

# 9. 提交
git add .
git commit -m "中文描述本次修改"
git push origin master
```

### 7.2 上游同步流程

详细流程参考 [docs/extension-build-and-upstream-sync.md](file:///Users/x/code/violentmonkey/docs/extension-build-and-upstream-sync.md)，关键点：

```bash
# 1. 备份当前分支
git branch backup/sync-$(date +%Y%m%d-%H%M%S)

# 2. 获取上游更新
git fetch upstream --prune

# 3. 查看差异
git log --oneline upstream/master..HEAD  # 我们的提交
git log --oneline HEAD..upstream/master  # 上游新提交

# 4. Rebase
git rebase upstream/master

# 5. 解决冲突后，完整验证
pnpm install --frozen-lockfile
pnpm run ci
pnpm build:extension

# 6. 推送（需要 force-with-lease）
git push --force-with-lease origin master
```

### 7.3 提交规范

使用中文提交信息，格式：
```
<类型>: <简短描述>

[可选的详细说明]
```

类型包括：
- `feat`：新功能
- `fix`：修复
- `docs`：文档
- `refactor`：重构
- `chore`：构建/工具
- `script`：用户脚本更新

示例：
```
feat: 添加脚本运行次数统计
fix: 修复 X 转帖在新 UI 下不生效的问题
script: 更新 X 自动转帖脚本到 v4.0.5
```

---

## 八、风险与注意事项

### 8.1 上游同步风险
- 上游代码变动可能导致自定义修改冲突
- 需要定期同步（建议每月一次），不要间隔太久
- 同步前务必备份
- 重大重构后要完整回归测试

### 8.2 浏览器兼容性
- MV2 和 MV3 差异较大，新功能要考虑双版本兼容
- Firefox 和 Chrome 有 API 差异，注意使用 `__.IS_FIREFOX` 判断
- Safari 有更多限制（如不支持 downloads 权限）

### 8.3 安全风险
- 用户脚本本质是注入第三方代码，安全是重中之重
- 预置脚本要经过代码审查，避免恶意行为
- 不要在代码中硬编码密钥或敏感信息
- 网络请求要注意权限和 CORS

### 8.4 性能风险
- 每个注入的脚本都会影响页面加载性能
- MutationObserver 和定时器要注意及时清理
- 避免在后台页面运行重 CPU 任务
- 大列表使用虚拟滚动

---

## 九、参考资源

### 9.1 官方资源
- [Violentmonkey 官网](https://violentmonkey.github.io/)
- [上游 GitHub](https://github.com/violentmonkey/violentmonkey)
- [Violentmonkey API 文档](https://violentmonkey.github.io/api/metadata-block/)
- [Discord 社区](https://discord.gg/XHtUNSm6Xc)

### 9.2 相关技术文档
- [Chrome Extension API](https://developer.chrome.com/docs/extensions/)
- [Firefox WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Electron 文档](https://www.electronjs.org/docs)
- [Vue 3 文档](https://cn.vuejs.org/)
- [CodeMirror 5 文档](https://codemirror.net/5/doc/manual.html)
- [Webpack 5 文档](https://webpack.js.org/)

### 9.3 用户脚本资源
- [Greasy Fork](https://greasyfork.org/)
- [OpenUserJS](https://openuserjs.org/)
- [Userscript.Zone](https://userscript.zone/)

---

## 十、下一步行动

1. **立即执行**：
   - 运行 `pnpm install && pnpm run ci && pnpm build:extension` 确认基线
   - 统一版本管理和用户脚本目录
   - 完善开发文档和工具链

2. **本周内**：
   - 选择 1-2 个高频使用场景，开发/增强预置脚本
   - 完善 Electron 桌面端基本功能
   - 配置好本地开发环境和调试流程

3. **本月内**：
   - 建立定期上游同步机制
   - 完成 1-2 个核心功能增强
   - 提高测试覆盖率

---

*文档生成时间：2026-08-10*
*基于项目版本：2.46.4 (seed 0.0.4)*
