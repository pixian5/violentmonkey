# Violentmonkey 项目开发方案

## 项目概述

Violentmonkey 是一个功能强大的浏览器用户脚本管理器，支持 Chrome、Firefox、Edge、Safari 等多平台。本项目采用现代化的浏览器扩展架构，实现了完整的脚本生命周期管理、云同步、多上下文注入等核心功能。

**当前版本**: 2.46.4 (beta 6)  
**技术栈**: Vue 3 + Webpack 5 + Gulp + Jest  
**代码规模**: 约 200+ 源文件，核心代码集中在 src/ 目录

---

## 一、架构分析

### 1.1 核心架构层次

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer (Vue 3)                      │
│  - Options Page (脚本管理、设置、同步)                    │
│  - Popup Page (快速访问、脚本开关)                        │
│  - Confirm Page (安装确认)                               │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Background Service Worker                   │
│  - 脚本生命周期管理 (db.js, script.js)                   │
│  - 存储与缓存 (storage.js, storage-cache.js)             │
│  - 消息路由 (messaging.js, handlers.js)                  │
│  - 注入控制 (preinject.js, preinject-core.js)            │
│  - 请求代理 (requests.js, GM_xmlhttpRequest)             │
│  - 云同步 (sync/sync-engine.js)                          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Injected Layer (双层注入)                    │
│  - Content Script (bridge.js, inject.js)                 │
│  - Web Script (gm-api.js, gm-global-wrapper.js)          │
│  - Bridge 通信 (CustomEvent + Callback)                  │
│  - 安全隔离 (safe-globals.js, Vault)                     │
└─────────────────────────────────────────────────────────┘
```

### 1.2 关键模块职责

#### Background 层

| 模块 | 职责 | 关键文件 |
|------|------|----------|
| 初始化 | 依赖注入、命令注册、隐私模式处理 | `utils/init.js` |
| 数据库 | 脚本索引、查询、安装/更新、资源获取 | `utils/db.js` |
| 存储 | 前缀化存储抽象、多级缓存、写入合并 | `utils/storage.js`, `storage-cache.js` |
| 预注入 | 三阶段注入管线、脚本匹配、realm 分配 | `utils/preinject*.js` |
| 请求代理 | GM_xmlhttpRequest、头注入、Cookie 路由 | `utils/requests*.js` |
| 同步 | 云存储集成、冲突解决、状态机 | `sync/*.js` |

#### Injected 层

| 模块 | 职责 | 关键文件 |
|------|------|----------|
| Content | 桥接后台与 Web、DOM 操作、菜单注册 | `content/bridge.js`, `gm-api-content.js` |
| Web | GM API 实现、值存储、资源访问 | `web/gm-api.js`, `gm-values.js` |
| 安全 | 无原型对象、原型链保护、CSP 绕过 | `safe-globals.js` |

---

## 二、架构优势

### 2.1 性能优化

1. **多级缓存策略**
   - L1: 内存缓存 (5分钟 TTL)
   - L2: 存储缓存 (1小时 TTL)
   - L3: 浏览器存储 (持久化)
   - 写入合并减少 storage API 调用

2. **快速 URL 匹配**
   - `tester.js` 使用 `StringTest` 类，无通配符模式比正则快 1.5x
   - 批量错误收集，避免重复解析

3. **注入缓存复用**
   - `BAG_NOOP` 减少内存分配
   - 预注入管线最大化利用时间窗口

### 2.2 安全模型

1. **双层隔离**
   - Content Script 与 Web Script 严格分离
   - 使用 CustomEvent + 唯一 ID 防止消息拦截

2. **原型链保护**
   - 所有内部对象使用 `createNullObj()` 创建
   - `__proto__: null` 防止原型污染攻击

3. **命令可见性控制**
   - `addOwnCommands` vs `addPublicCommands` 区分访问权限
   - URL 验证防止黑名单绕过

### 2.3 跨浏览器兼容

1. **MV2/MV3 双支持**
   - 条件编译 (`__.MV3`) 处理差异
   - DNR vs webRequest 自动适配
   - Offscreen document 处理 MV3 限制

2. **浏览器抽象层**
   - `browser.js` 通过 Proxy 统一 API 差异
   - 针对 Chrome/Firefox 的特定 workaround

---

## 三、架构弱点与技术债务

### 3.1 模块级状态过多

**问题**: 大量模块使用模块级可变状态

```javascript
// db.js
let maxScriptId = 0;
let maxScriptPosition = 0;
export let dbKeys = new Map();

// preinject-core.js
export let isApplied;
export let injectInto;
export let downloadMode;
```

**影响**:
- 单元测试困难
- 模块间隐式耦合
- 状态同步问题

**建议**: 引入依赖注入或状态管理库，集中管理全局状态

### 3.2 MV2/MV3 分支散布

**问题**: `__.MV3` 条件判断散布在代码各处

```javascript
if (__.MV3) {
  // MV3 逻辑
} else {
  // MV2 逻辑
}
```

**影响**:
- 认知负担增加
- 代码重复
- 维护困难

**建议**: 
- 提取浏览器特定的策略对象
- 使用适配器模式统一接口
- 减少条件分支

### 3.3 注入管线复杂性

**问题**: 三个文件分工不够直观

- `preinject-core.js`: 缓存管理、选项处理、脚本注册
- `preinject-prepare.js`: 代码构建、realm 分配
- `preinject.js`: 命令处理、存储变化响应

**建议**: 重新组织为清晰的管线阶段
```
Match → Prepare → Register → Inject
```

### 3.4 db.js 职责过重

**问题**: 单文件超过 1000 行，承担多项职责

- 脚本索引管理
- 查询与过滤
- 安装/更新逻辑
- 资源获取
- 数据库维护

**建议**: 拆分为独立模块
- `script-index.js`: 索引管理
- `script-query.js`: 查询逻辑
- `script-install.js`: 安装/更新
- `script-resource.js`: 资源获取
- `script-maintenance.js`: 维护操作

### 3.5 错误处理不一致

**问题**: 部分地方抛出字符串，部分抛出 Error 对象

```javascript
throw 'Invalid URL';  // 不一致
throw new Error('Invalid URL');  // 推荐
```

**建议**: 统一使用 Error 对象，提供堆栈追踪

---

## 四、测试覆盖分析

### 4.1 当前测试覆盖

| 模块 | 覆盖情况 | 测试文件 |
|------|----------|----------|
| 元数据解析 | ✅ 已覆盖 | `test/background/script.test.js` |
| URL 匹配 | ✅ 已覆盖 | `test/background/tester.test.js` |
| 通用工具 | ✅ 已覆盖 | `test/common/index.test.js` |
| @resource 解码 | ✅ 已覆盖 | `test/injected/gm-resource.test.js` |
| JSON 序列化 | ✅ 已覆盖 | `test/injected/helpers.test.js` |
| 搜索规则 | ✅ 已覆盖 | `test/options/search.test.js` |
| ESLint 规则 | ✅ 已覆盖 | `test/eslint/eslint.test.js` |
| X 自动转帖 | ✅ 已覆盖 | `test/userscripts/x-auto-retweet.test.js` |

### 4.2 严重缺失的测试

#### 高优先级

1. **同步模块** (完全没有测试)
   - `sync-engine.js` 的同步算法
   - `state-machine.js` 的状态转换
   - OAuth 流程
   - 各云存储提供商 (dropbox, googledrive, onedrive, webdav, s3)

2. **背景脚本核心**
   - 脚本安装/更新/删除逻辑
   - 权限管理
   - 消息传递
   - 存储管理

3. **注入脚本**
   - GM_* API 实现
   - Content/Web 上下文注入
   - Bridge 通信

#### 中优先级

4. **UI 组件** (Vue 组件完全没有测试)
   - Options 页面
   - Popup 页面
   - Confirm 页面

5. **构建系统**
   - Manifest 生成
   - 版本计算
   - 国际化处理

#### 低优先级

6. **集成测试**
   - 端到端测试
   - 跨浏览器测试
   - 性能基准测试

### 4.3 测试质量评估

**优点**:
- 使用 Jest 框架，配置完善
- Mock 基础设施存在 (`test/mock/`)
- 部分核心逻辑有测试

**不足**:
- 缺少集成测试
- 缺少端到端测试
- 缺少性能测试
- Mock 使用不充分

---

## 五、构建系统分析

### 5.1 Webpack 配置

**架构**:
- `webpack-base.js`: 基础配置
- `webpack.conf.js`: 主配置，动态生成多个构建目标
- `webpack-util.js`: 工具函数

**构建目标**:
1. background/sw (后台脚本)
2. offscreen (MV3 离屏文档)
3. injected (内容脚本)
4. injected-web (Web 页面脚本)
5. tld (TLD 解析库，仅 MV3)
6. UI 页面 (confirm, options, popup)

**安全机制**:
- `safe-globals.js`: 安全全局变量包装
- `babel-plugin-safe-bind.js`: 函数绑定转换
- `restricted-syntax`: ESLint 规则限制不安全语法

**优化**:
- Terser 压缩 (`reduce_funcs: false`)
- CSS 提取 (MiniCssExtractPlugin)
- 代码分割 (common-ui, codemirror, vendor)
- 常量内联 (InlineConstantExportsPlugin)

### 5.2 Gulp 任务

**核心任务**:
- `clean`: 清理输出目录
- `manifest`: 生成 manifest.json
- `createIcons`: 多尺寸图标生成 (Sharp)
- `copyI18n`: 国际化文件处理 (YAML → JSON)
- `updateI18n`: 从源码提取 i18n 键
- `bump`: 版本号递增

**开发模式**:
```bash
gulp dev  # 并行执行 pack + watch
```

**生产构建**:
```bash
gulp build  # clean + pack + jsProd
```

### 5.3 MV2 vs MV3 差异

| 特性 | MV2 | MV3 |
|------|-----|-----|
| 后台 | background page | service worker |
| Manifest | `browser_action` | `action` |
| 请求拦截 | `webRequestBlocking` | `declarativeNetRequest` |
| 注入 API | `tabs.executeScript` | `userScripts.execute` |
| 定时任务 | `setTimeout` | `chrome.alarms` |
| 离屏文档 | 不需要 | offscreen document |
| 输出目录 | `dist/` | `dist-mv3/` |

### 5.4 构建性能问题

1. **多次构建**: Release 流程构建 4 次 (MV2, MV3, self-hosted, beta)
2. **无缓存**: CI 中没有 pnpm 缓存
3. **图标重复生成**: 每次构建都重新生成所有图标
4. **CodeMirror 主题**: 每次构建都读取文件系统

**优化建议**:
- 启用 pnpm 缓存
- 增量图标生成
- MV2/MV3 并行构建
- 缓存 CodeMirror 主题列表

---

## 六、同步模块分析

### 6.1 架构设计

```
┌─────────────────────────────────────────┐
│         sync-engine.js (核心)            │
│  - createSyncService 工厂函数            │
│  - _sync 同步算法                        │
│  - 队列机制                              │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         state-machine.js (状态机)        │
│  - IDLE → UNAUTHORIZED → AUTHORIZING    │
│  - AUTHORIZED → IN_PROGRESS → IDLE      │
│  - ERROR 状态处理                        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      云存储提供商 (插件化)               │
│  - dropbox.js (OAuth2)                  │
│  - googledrive.js (OAuth2)              │
│  - onedrive.js (OAuth2)                 │
│  - webdav.js (密码认证)                  │
│  - s3.js (密码认证)                      │
└─────────────────────────────────────────┘
```

### 6.2 同步算法

1. **数据收集**
   - 获取远程元数据和本地脚本列表
   - 构建本地和远程快照
   - 标记已删除项目为 tombstone

2. **冲突解决**
   - 使用 `@usync/sync` 库计算同步动作
   - 支持三种模式: MERGE, PULL, PUSH

3. **执行同步**
   - `putLocal`: 从远程下载到本地
   - `putRemote`: 从本地上传到远程
   - `delLocal`: 删除本地脚本
   - `delRemote`: 删除远程脚本
   - `updateLocal`: 更新本地信息

4. **元数据管理**
   - 维护 `lastModified` 时间戳
   - 同步脚本位置和启用状态
   - 清理超过一年的 tombstone

### 6.3 OAuth 流程

**MV2**:
- 使用 `browser.webRequest.onBeforeRequest` 拦截重定向
- 超时时间: 5 分钟

**MV3**:
- 使用 `chrome.identity.launchWebAuthFlow`
- 使用 DNR 重定向
- 自动关闭授权标签页

### 6.4 数据格式

**脚本数据**:
```javascript
{
  version: 2,
  code: "...",
  custom: {...},
  config: {...},
  props: { lastUpdated, lastModified, position }
}
```

**元数据**:
```javascript
{
  timestamp: 1234567890,
  info: {
    [uri]: {
      modified: 1234567890,
      position: 1,
      enabled: true,
      deleted: false
    }
  }
}
```

---

## 七、开发建议

### 7.1 高优先级改进

#### 1. 添加同步模块测试

**目标**: 覆盖同步算法、状态机、OAuth 流程

**实施步骤**:
1. Mock 云存储 API
2. 测试同步算法 (merge, pull, push)
3. 测试状态机转换
4. 测试 OAuth 流程 (使用 Playwright)

**预期收益**:
- 减少同步相关 bug
- 支持安全重构
- 提高代码质量

#### 2. 启用 CI 缓存

**目标**: 减少 CI 构建时间

**实施**:
```yaml
- uses: actions/setup-node@v6
  with:
    cache: 'pnpm'
```

**预期收益**:
- CI 时间减少 30-50%
- 降低 CI 成本

#### 3. 安全审计

**目标**: 识别和修复安全漏洞

**实施**:
1. 运行 `pnpm audit`
2. 审查注入脚本代码
3. 检查 CSP 策略
4. 验证输入验证

**预期收益**:
- 提高安全性
- 减少安全风险

### 7.2 中优先级改进

#### 4. 添加背景脚本测试

**目标**: 覆盖脚本生命周期、权限管理、消息传递

**实施**:
1. Mock browser.storage API
2. 测试脚本安装/更新/删除
3. 测试权限检查
4. 测试消息路由

#### 5. 并行构建

**目标**: 减少 Release 构建时间

**实施**:
```yaml
- name: Build MV2 and MV3
  run: |
    pnpm build:extension &
    pnpm build:mv3 &
    wait
```

#### 6. TypeScript 迁移 (渐进式)

**目标**: 提高类型安全

**实施**:
1. 从关键模块开始 (db.js, storage.js)
2. 添加 JSDoc 类型注释
3. 逐步迁移到 TypeScript
4. 使用 `vue-tsc` 检查 Vue 组件

### 7.3 低优先级改进

#### 7. 完善文档

**目标**: 帮助新开发者上手

**内容**:
- 架构设计文档
- 同步算法说明
- API 文档
- 贡献指南

#### 8. 性能监控

**目标**: 建立性能基准

**实施**:
1. 添加性能测试
2. 监控内存使用
3. 监控启动时间
4. 监控脚本注入延迟

#### 9. 发布流程优化

**目标**: 自动化发布流程

**实施**:
1. 使用 semantic-release
2. 自动生成 Changelog
3. 自动化发布前检查

---

## 八、重构建议

### 8.1 db.js 拆分

**当前问题**: 单文件超过 1000 行，职责过重

**拆分方案**:

```
utils/db.js (保留核心索引)
  ├─ utils/script-index.js (索引管理)
  ├─ utils/script-query.js (查询逻辑)
  ├─ utils/script-install.js (安装/更新)
  ├─ utils/script-resource.js (资源获取)
  └─ utils/script-maintenance.js (维护操作)
```

**实施步骤**:
1. 提取独立函数到对应模块
2. 保持 db.js 作为门面 (Facade)
3. 逐步迁移调用方
4. 添加单元测试

### 8.2 注入管线重组

**当前问题**: 三个文件分工不够清晰

**重组方案**:

```
preinject/
  ├─ matcher.js (脚本匹配)
  ├─ preparer.js (代码构建)
  ├─ registrar.js (脚本注册)
  ├─ injector.js (实际注入)
  └─ cache.js (缓存管理)
```

**实施步骤**:
1. 定义清晰的管线阶段
2. 提取函数到对应模块
3. 使用管道模式连接各阶段
4. 添加单元测试

### 8.3 状态管理集中化

**当前问题**: 模块级状态过多

**改进方案**:

```javascript
// state.js
export const state = {
  db: {
    maxScriptId: 0,
    maxScriptPosition: 0,
    dbKeys: new Map(),
  },
  preinject: {
    isApplied: false,
    injectInto: AUTO,
    downloadMode: AUTO,
  },
};

// 使用方式
import { state } from './state';
state.db.maxScriptId += 1;
```

**实施步骤**:
1. 创建 state.js 集中管理状态
2. 逐步迁移模块级状态
3. 添加状态变更通知机制
4. 支持状态快照和恢复

---

## 九、CI/CD 优化

### 9.1 当前工作流

1. **CI 工作流** (ci.yml)
   - 触发: push 到 master, PR, 手动触发
   - 步骤: 安装 → 测试 → 构建 → 上传产物

2. **Release 工作流** (release.yml)
   - 触发: v* 标签, 手动触发
   - 步骤: 测试 → 多次构建 → 发布到各平台

3. **Edge Release** (release-edge.yml)
   - 触发: v* 标签
   - 步骤: 构建 MV2 → 发布到 Edge

4. **翻译同步** (transifex-*.yml)
   - Pull: 每周一 01:00 UTC
   - Push: i18n 标签 PR 合并后

### 9.2 优化建议

#### 1. 启用缓存

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: '24'
    cache: 'pnpm'
```

#### 2. 并行构建

```yaml
- name: Build all variants
  run: |
    pnpm build:extension &
    pnpm build:mv3 &
    pnpm build:selfHosted &
    wait
```

#### 3. 构建矩阵

```yaml
strategy:
  matrix:
    node-version: [22, 24]
    os: [ubuntu-latest, macos-latest]
```

#### 4. 依赖审计

```yaml
- name: Audit dependencies
  run: pnpm audit --audit-level=high
```

#### 5. 包体积检查

```yaml
- name: Check bundle size
  run: |
    pnpm build:extension
    du -sh dist/
    # 设置阈值，超过则失败
```

---

## 十、安全加固

### 10.1 当前安全措施

1. **双层隔离**
   - Content Script 与 Web Script 严格分离
   - 使用 CustomEvent + 唯一 ID

2. **原型链保护**
   - `createNullObj()` 创建无原型对象
   - `__proto__: null` 防止污染

3. **命令可见性**
   - `addOwnCommands` vs `addPublicCommands`
   - URL 验证防止绕过

4. **CSP 绕过**
   - 通过 Content Script 创建元素
   - 自动添加 nonce 属性

### 10.2 加固建议

#### 1. 实施严格 CSP

```javascript
// manifest.json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

#### 2. 输入验证

```javascript
// 所有用户输入必须验证
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new TypeError('Invalid URL');
  }
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
```

#### 3. 依赖更新

```bash
# 定期检查依赖更新
pnpm outdated
pnpm update --interactive
```

#### 4. 代码审计

- 定期审计注入脚本代码
- 使用静态分析工具
- 审查第三方依赖

---

## 十一、性能优化

### 11.1 当前优化

1. **多级缓存**
   - 内存缓存 (5分钟)
   - 存储缓存 (1小时)
   - 浏览器存储 (持久化)

2. **写入合并**
   - GM_*Value 写入延迟 100ms
   - 批量写入减少 storage API 调用

3. **快速匹配**
   - StringTest 类比正则快 1.5x
   - 批量错误收集

4. **注入缓存**
   - BAG_NOOP 减少内存分配
   - 预注入管线优化

### 11.2 优化建议

#### 1. 懒加载

```javascript
// 按需加载模块
const syncEngine = async () => {
  const { default: engine } = await import('./sync/sync-engine');
  return engine;
};
```

#### 2. Web Worker

```javascript
// 将密集计算移到 Worker
const worker = new Worker('script-matcher.js');
worker.postMessage({ url, scripts });
worker.onmessage = (e) => {
  const matched = e.data;
};
```

#### 3. 内存监控

```javascript
// 监控内存使用
if (performance.memory) {
  const { usedJSHeapSize } = performance.memory;
  if (usedJSHeapSize > THRESHOLD) {
    console.warn('High memory usage');
  }
}
```

#### 4. 性能基准

```javascript
// 建立性能基准
const benchmarks = {
  scriptMatch: 10, // ms
  scriptInject: 50, // ms
  syncComplete: 5000, // ms
};
```

---

## 十二、版本管理

### 12.1 当前版本策略

- **package.json**: `version` 字段 (2.46.4)
- **beta 序号**: `beta` 字段 (6)
- **manifest 版本**: 由 `version-helper.js` 计算

**计算规则**:
```javascript
manifest.version = `${version}.${beta}`
// 2.46.4 + beta 6 = 2.46.6
```

### 12.2 版本递增

```bash
# 递增 beta
pnpm bumpVersion

# 递增 minor
pnpm version minor

# 递增 major
pnpm version major
```

### 12.3 建议

1. **使用 semantic-release**
   - 自动版本号递增
   - 自动生成 Changelog
   - 自动打标签

2. **版本锁定**
   - 使用 `packageManager` 字段锁定 pnpm 版本
   - 使用 `engines` 字段锁定 Node.js 版本

---

## 十三、开发工作流

### 13.1 本地开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建扩展
pnpm build:extension

# 运行测试
pnpm test

# 代码检查
pnpm lint
```

### 13.2 提交规范

**Commit Message 格式**:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型**:
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具

**示例**:
```
feat(sync): 添加 Dropbox 同步支持

- 实现 OAuth2 授权流程
- 实现文件上传/下载
- 添加同步冲突解决

Closes #123
```

### 13.3 分支策略

```
master          # 主分支，稳定版本
  ↓
develop         # 开发分支
  ↓
feature/*       # 功能分支
  ↓
hotfix/*        # 紧急修复
```

**工作流**:
1. 从 develop 创建 feature 分支
2. 开发完成后提交 PR
3. Code review 后合并到 develop
4. develop 测试稳定后合并到 master
5. master 打标签发布

---

## 十四、监控与告警

### 14.1 错误监控

**建议工具**:
- Sentry: 错误追踪
- LogRocket: 用户会话回放
- Google Analytics: 使用统计

**实施**:
```javascript
// 错误上报
window.addEventListener('error', (e) => {
  Sentry.captureException(e.error);
});

// Promise  rejection
window.addEventListener('unhandledrejection', (e) => {
  Sentry.captureException(e.reason);
});
```

### 14.2 性能监控

**指标**:
- 脚本注入延迟
- 同步完成时间
- 内存使用
- CPU 使用

**实施**:
```javascript
// 性能标记
performance.mark('script-inject-start');
// ... 注入逻辑
performance.mark('script-inject-end');
performance.measure('script-inject', 'script-inject-start', 'script-inject-end');
```

### 14.3 告警

**阈值**:
- 错误率 > 1%
- P95 延迟 > 500ms
- 内存使用 > 100MB

**通知**:
- Email
- Slack/Discord
- SMS (严重问题)

---

## 十五、总结

Violentmonkey 是一个成熟、高度优化的浏览器扩展项目，具有以下特点:

**优势**:
1. 性能优化极致 (多级缓存、写入合并、快速匹配)
2. 安全模型完善 (双层隔离、原型链保护、CSP 绕过)
3. 跨浏览器兼容 (MV2/MV3、Chrome/Firefox/Safari)
4. 功能完整 (脚本管理、云同步、多上下文注入)

**挑战**:
1. 测试覆盖率低 (同步模块、背景脚本、UI 组件)
2. 模块级状态过多 (单元测试困难)
3. MV2/MV3 分支散布 (认知负担)
4. 注入管线复杂 (维护困难)

**建议优先级**:
1. **高**: 添加同步模块测试、启用 CI 缓存、安全审计
2. **中**: 添加背景脚本测试、并行构建、TypeScript 迁移
3. **低**: 完善文档、性能监控、发布流程优化

通过系统性地改进这些领域，可以显著提高代码质量、开发效率和用户体验。

---

## 附录

### A. 关键文件索引

| 文件 | 职责 | 行数 |
|------|------|------|
| `src/background/utils/db.js` | 脚本生命周期管理 | 1042 |
| `src/background/utils/storage-cache.js` | 多级缓存实现 | 263 |
| `src/background/utils/preinject.js` | 注入命令处理 | 202 |
| `src/background/utils/requests.js` | 请求代理实现 | 302 |
| `src/background/sync/sync-engine.js` | 同步算法核心 | 1006 |
| `src/injected/content/bridge.js` | Bridge 通信 | 80 |
| `src/injected/web/gm-api.js` | GM API 实现 | 252 |

### B. 依赖清单

**核心依赖**:
- Vue 3.5.40
- Webpack 5.109.0
- CodeMirror 5.65.20
- Jest 30.4.2
- ESLint 8.57.1

**内部包**:
- `@violentmonkey/types`: 类型定义
- `@violentmonkey/shortcut`: 快捷键处理
- `@violentmonkey/xml-parser`: XML 解析
- `@usync/sync`: 同步算法
- `@usync/oauth2`: OAuth2 流程
- `@usync/drive`: 云存储驱动

### C. 构建命令

```bash
# 开发
pnpm dev              # MV2 开发模式
pnpm dev:mv3          # MV3 开发模式

# 构建
pnpm build:extension  # MV2 生产构建
pnpm build:mv3        # MV3 生产构建
pnpm build:selfHosted # 自托管版本

# 测试
pnpm test             # 运行测试
pnpm lint             # 代码检查
pnpm ci               # 测试 + 检查

# 发布
pnpm bumpVersion      # 递增 beta
pnpm version minor    # 递增 minor
```

### D. 相关文档

- [DEVELOPMENT.md](./DEVELOPMENT.md): 开发指南
- [RELEASE.md](./RELEASE.md): 发布流程
- [docs/extension-build-and-upstream-sync.md](./docs/extension-build-and-upstream-sync.md): 扩展构建与上游同步
- [docs/2026-08-07-code-review-fixes.md](./docs/2026-08-07-code-review-fixes.md): 代码审查修复记录

---

**文档版本**: 1.0  
**最后更新**: 2026-08-10  
**作者**: Qwen AI Assistant
