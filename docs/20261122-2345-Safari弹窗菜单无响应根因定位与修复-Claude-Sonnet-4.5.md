# 20261122-2345 Safari 弹窗菜单全部无响应根因定位与修复

- 模型：Claude Sonnet 4.5
- 版本：0.1.2（工程）/ 2.49.4（扩展）
- 目标：修复 Safari 扩展「点工具栏图标能出弹窗菜单，但点菜单里任何一项都没反应」

## 现象

Safari 15+ 打开任意网页，点工具栏的「Violentmonkey BETA」图标能弹出菜单，但：

- 点启用/禁用开关：无变化
- 点齿轮（管理面板）：无反应
- 点加号（新建脚本）：无反应
- 点 GF / OUJS 链接：无反应
- 弹窗底部还会渲染一段 `bt@popup/index.js:1:23871 x@common-ui.js:1:101690 @common-ui.js:1:104775`

## 根因

一句话：**Safari 后台脚本在求值阶段就崩溃了，`runtime.onMessage` 监听器从未注册。**

因果链：

1. 上游 `src/background/utils/permissions.js` 在**模块顶层**调用
   `browserPermissions.contains({ permissions: ['downloads'] })`。
2. Safari 不认识 `downloads` 权限名，`chrome.permissions.contains` **同步抛出**
   `Invalid call to permissions.contains(). The 'permissions' value is invalid,
   because 'downloads' is not a valid permission.`
3. 这个同步异常发生在 bundle 求值期间，没有被任何地方捕获，
   **整个后台脚本（background/index.js）立即中止**。
4. 因此 `src/background/index.js` 末尾的
   `global.handleCommandMessage = ...` 与 `runtime.onMessage.addListener(...)` 都没执行。
5. 弹窗仍然能渲染（HTML/CSS 与 popup/index.js 都是独立的），
   但 `sendCmdDirectly('InitPopup')` 返回 `undefined`（`runtime.sendMessage` 无接收方），
   `sendMessageRetry` 超时后抛 `cannot connect to the background page`。
6. 弹窗里 `[cached, data, [failure, ...]] = await sendCmdDirectly('InitPopup')`
   对 `undefined` 解构失败，于是底部显示那段红色堆栈。

## 证据

### 1. 报错列号精确对上代码

`dist/popup/index.js` 第 1 行第 **23871** 列正好是：

```js
let[e,t,[n,o,l]] = F.popup || await (0,R.dr)("InitPopup");
//   ^ 23871
```

即 `InitPopup` 的返回值被解构的位置，说明返回值是 `undefined` 而非数组。

### 2. 后台页存在，但没有命令入口

用 AppleScript 从扩展页注入 JS 读取后台页：

```js
chrome.extension.getBackgroundPage()        // => 对象（后台页存在）
p.browser / p.chrome                        // => object（polyfill 已建立）
p.handleCommandMessage                      // => undefined  ← 关键
p.deepCopy                                  // => undefined  ← 关键
```

后台页存在但入口函数未挂载 = **bundle 求值中途崩溃**。

### 3. 系统日志显示后台进程只活了 27ms

```
ProcessThrottler::Activity::Activity: Starting foreground activity / 'Web Extension background content'
ProcessThrottler::Activity::invalidate: Ending foreground activity / 'Web Extension background content'
```
两条相隔 27ms，说明后台启动后立刻结束。

### 4. 扩展数据目录从未落盘

`~/Library/Containers/com.apple.Safari/Data/Library/WebKit/WebExtensions/Default/`
下本扩展目录只有 `State.plist`，从未生成 `LocalStorage.db`
（对照 uBlock Origin Lite 有完整的 `LocalStorage.db` + WAL）。

### 5. 加诊断日志后直接看到崩栈

在 fork 层加入 `[fork]` 诊断（写入 localStorage，弹窗同源可读）后，
弹窗直接显示出：

```
permissions.contains 抛错，按无权限处理 ::
Invalid call to permissions.contains(). The 'permissions' value is invalid,
because 'downloads' is not a valid permission.
  <contains@[native code]
   <- n@background/index.js:1:15015
   <- @background/index.js:1:179951
   <- global code@background/index.js:1:280835>
```

`280835` 就是 bundle 顶层执行的最后位置，与 `permissions.js` 的顶层调用完全对应。
同一条日志里紧接着出现 `后台模块全部加载完成` 与 `init 完成，后台命令已就绪`，
证明修复后 bundle 完整求值、init 正常完成。

## 修复

全部改动集中在 `src/fork/`，不改上游文件。

### 1. 拦截 `permissions.contains` 的非法权限名（根因修复）

`src/fork/api-stubs.js`：

- 新增 `SAFARI_UNKNOWN_PERMISSIONS = ['downloads']`
- 包装 `permissions.contains`：
  1. 先把 Safari 不认识、会直接抛错的权限名从请求里剔除（语义等价于“没有该权限”）
  2. 仍包一层 try/catch 兜底，异常一律转成 `false`，绝不让它冒到上游

### 2. 所有补丁互不牵连（防止同类崩溃复现）

`src/fork/guard.js`（新增）：

- `safePatch(label, fn)`：单个补丁失败只记日志，不中断后续补丁与上游模块求值
- `trySet(obj, key, value)`：给可能只读的 API 成员赋值，失败先记日志再尝试
  `Object.defineProperty`，仍失败也只记日志
- 最早安装 `error` / `unhandledrejection` 监听，把崩溃栈写入 `localStorage['fork:log']`

`src/fork/api-stubs.js`、`safari-shims.js`、`action-api-patch.js` 全部改用
`safePatch` + `trySet`。

### 3. 修复上一轮遗留的三处回调丢失

| 位置 | 问题 | 后果 |
| --- | --- | --- |
| `storage.local.get` 补丁 | 只接收 `keys`，丢掉 wrapAsync 追加的回调 | Promise 永不 resolve，init 卡死 |
| `tabs.query` 补丁 | 写成 `async (info)`，丢掉回调 | `getActiveTab()` 死锁 |
| stub 全是 `async () => ...` | 只返回 Promise 不调回调 | 所有依赖永久 pending |

MV2 下 `src/common/browser.js` 的 `wrapAsync` **恒以 `fn(...args, cb)` 调用且忽略返回值**，
所以任何“只返回 Promise、不调用回调”的实现都会让外层永久 pending。
`stubFn` 现在同时支持回调式与 Promise 式。

### 4. 修复 `windows.getAll()` 返回非数组导致 init 依赖 reject

`src/background/utils/ua.js` 直接 `[wnd] = await browserWindows.getAll()`，
Safari 在部分场景返回 `undefined` → `undefined is not iterable` →
`resolveInit()` 里的 `Promise.all` reject → init 永不完成 → 所有命令挂起。

`patchResult('windows', 'getAll', asArray)` 等把返回值规整为期望类型。

### 5. 新增 `tabs.create` 降级重试

Safari 的 `tabs.create` 对不认识的字段很敏感（`openerTabId` / `cookieStoreId` / `index`），
任一字段被拒即整体失败，表现为「点齿轮后弹窗关了但没打开面板」。
现在先原样调用，失败后逐级剔除不支持的字段重试。

### 6. 命令级错误日志

`src/fork/diagnostics.js` 在微任务里给所有后台命令包一层，
只在失败时记录命令名、参数摘要与堆栈。这样以后任何菜单项失效都能直接从日志看到原因。

## 验证

### Node 严格 mock 双向对照

把真实 `dist/background/index.js` 加载到 Node `vm` 沙箱，模拟 Safari 环境：
回调式 `chrome.*`、`windows.getAll` 返回 `undefined`、`permissions.contains` 同步抛错、
`tabs.create` 拒绝 `openerTabId` 等字段。

| 产物 | 结果 | 打开标签页 |
| --- | --- | --- |
| 修复前（`bg-old.js`） | **0/7 通过**（全部 TIMEOUT） | 无 |
| 修复后 | **6/7 通过** | 面板、编辑器均成功打开 |

`UpdateScriptInfo` 失败是预期：mock 里脚本 id=1 不存在。

### Safari 实机验证（macOS 27.2 / Safari 27.2）

| 操作 | 结果 |
| --- | --- |
| 打开弹窗 | 正常渲染，**不再显示红色堆栈** |
| 点齿轮 → 管理面板 | 正常打开（`options/index.html`） |
| 面板点 + → 新建 | 正常进入编辑器（`#scripts/_new`），代码模板已加载 |
| 面板点「设置 \| 备份」 | 设置页正常渲染并可交互 |
| 弹窗启用开关 | 切换生效（触发页面重载，属预期行为） |

诊断日志确认：`后台模块全部加载完成` → `init 完成，后台命令已就绪`。

## 经验（避坑）

1. **Safari 的扩展 API 会对“它不认识的参数值”同步抛错**，不只是回调里给 `lastError`。
   模块顶层的这类调用会直接炸掉整个后台 bundle，且没有任何可见报错。
2. **后台页存在 ≠ 后台脚本正常运行**。判断方法：
   读 `chrome.extension.getBackgroundPage()` 上是否真的挂上了
   `handleCommandMessage` / `deepCopy` 这类入口。
3. **MV2 的 `wrapAsync` 调用约定是 `fn(...args, cb)` 且忽略返回值**。
   任何 async stub 或补丁只要丢掉 cb，外层就永久 pending。写补丁必须同时支持两种调用方式。
4. **`resolveInit()` 只在所有 init 依赖成功后执行**。
   任一依赖 reject，`init` 就永久 pending，而 `handleCommandMessage` 开头
   `if (init) return init.then(...)` 会把**所有**命令挂起。
5. Safari 后台没有可直接打开的 devtools 面板。把日志写进 `localStorage`
   （弹窗同源可读）是最省事的取证方式。
6. 定位压缩产物的报错行号：直接按列号在产物里切片打印上下文，
   比对着 source map 猜更快。
