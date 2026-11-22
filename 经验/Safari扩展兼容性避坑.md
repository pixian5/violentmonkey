# Safari Web Extension 兼容性避坑

面向 macOS Safari 打包 Violentmonkey 时踩过的坑。每条都对应过真实故障。

## 1. API 会同步抛错，不只是 `lastError`

Chrome 的惯例是“调用失败 → 回调里给 `chrome.runtime.lastError`”。
**Safari 不是**：它对“不认识的参数值”直接**同步 throw**。

已确认的案例：

```js
// Safari 抛：Invalid call to permissions.contains(). The 'permissions' value
// is invalid, because 'downloads' is not a valid permission.
chrome.permissions.contains({ permissions: ['downloads'] })
```

致命之处在于：如果这类调用发生在**模块顶层**，异常会中止整个 bundle，
后续所有顶层代码（包括 `runtime.onMessage.addListener`）都不会执行。

对策：

- 调用前剔除 Safari 不认识的权限名 / 参数值
- 外层永远包 try/catch，把异常转成“能力不可用”的默认值
- 用 `safePatch` 让单个补丁失败不牵连其它补丁

## 2. 判断后台是否真的跑起来

后台页对象存在不代表脚本正常执行。可靠的判断方式：

```js
const p = chrome.extension.getBackgroundPage();
typeof p.handleCommandMessage   // 应该是 'function'
typeof p.deepCopy               // 应该是 'function'
```

这两个都是 `undefined` 就说明 bundle 在求值阶段崩了。

辅助证据：

- 系统日志里 `'Web Extension background content'` 的 foreground activity
  只持续几十毫秒
- 扩展数据目录里没有 `LocalStorage.db`
  （`~/Library/Containers/com.apple.Safari/Data/Library/WebKit/WebExtensions/Default/`）

## 3. 只读的 API 成员

Safari 的部分扩展 API 成员是只读的。`"use strict"` 下直接赋值会抛 `TypeError`，
非严格模式下会**静默失败**（赋值后值没变）。

所以打补丁不要只写 `tabs.foo = patched`，要检查是否真的生效：

```js
obj[key] = value;
if (obj[key] !== value) {
  // 尝试 defineProperty（可配置属性可以这样覆盖）
  Object.defineProperty(obj, key, { value, writable: true, configurable: true });
}
```

已确认在 Safari 上写不进去的：`tabs.executeScript` / `tabs.insertCSS` / `tabs.removeCSS`。
这类补丁实际不生效，需要换思路（例如在调用点适配，而不是替换 API 本身）。

## 4. `tabs.create` 的字段很挑

Safari 对 `tabs.create` 的入参校验严格，`openerTabId` / `cookieStoreId` / `index`
任一不被接受就整体失败，且失败信息不总是清晰。

上游 `TabOpen` 会把这些字段全带上，于是“点菜单后弹窗关了却没打开页面”。

对策：失败后逐级剔除不支持的字段重试，最后只保留 `url`。

## 5. 回调式与 Promise 式必须同时支持

MV2 下 `src/common/browser.js` 的 `wrapAsync` **恒以 `fn(...args, cb)` 调用，
且完全不使用返回值**。因此：

```js
// 错误：wrapAsync 传进来的 cb 被丢了，外层 Promise 永远 pending
tabs.query = async info => {...};

// 正确：两种调用方式都支持
tabs.query = (info, ...rest) => {
  const cb = typeof rest[rest.length - 1] === 'function' ? rest.pop() : null;
  return cb ? orig.call(tabs, info, cb) : orig(info);
};
```

同理，任何 stub 都不能写成 `async () => value`，必须：

```js
const stubFn = value => (...args) => {
  const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
  const res = typeof value === 'function' ? value() : value;
  if (!cb) return Promise.resolve(res);
  setTimeout(cb, 0, res);
};
```

## 6. `resolveInit` 的单点失败会挂起全部命令

`src/background/utils/init.js`：

```js
resolveInit = async () => {
  await Promise.all(deps.map(d => typeof d === 'function' ? d() : d));  // 任一 reject 就卡住
  resolve();
};
```

而 `handleCommandMessage` 开头：

```js
if (init) return init.then(handleCommandMessage.bind(this, ...arguments));
```

→ 只要有一个 init 依赖失败或永不回调，**所有后台命令都会永久挂起**，
但弹窗仍能渲染。这个现象极具迷惑性，要优先怀疑 init。

已知的依赖失败点：

| 依赖 | 失败原因 |
| --- | --- |
| `ua.js` 的 `browserWindows.getAll()` | Safari 返回 `undefined` → `[wnd]` 解构抛 TypeError |
| `permissions.js` 的 `contains({permissions:['downloads']})` | 同步抛“非法权限名” |
| `storage` 相关 | 补丁丢掉回调 → Promise 永不 resolve |
| `tabs.query` | 补丁写成 async → 回调丢失 → `getActiveTab()` 死锁 |

## 7. 后台没有 devtools，靠自己留证据

Safari 的扩展后台页没有可直接打开的 devtools 面板。最省事的方案是把日志写进
`localStorage`：弹窗页与后台同源，可以直接读出来显示。

```js
localStorage.setItem('fork:log', JSON.stringify(lines));
```

再用 AppleScript 从扩展页注入 JS 读取：

```applescript
tell application "Safari" to tell current tab of front window
  do JavaScript "localStorage.getItem('fork:log')"
end tell
```

前提：Safari → 开发 → 允许来自 Apple 事件的 JavaScript 已勾选。

## 8. `manifest.background.persistent`

Safari 可能把缺 `persistent` 的 MV2 后台视为非持久（脚本可能不加载）。
上游依赖后台常驻（webRequest 监听 + 内存脚本索引），因此要显式写
`persistent: true`。

## 9. 验证用的 mock 必须显式给 `manifest.fork.target`

`src/fork/target.js` 靠 `chrome.runtime.getManifest().fork?.target === 'safari'` 判断是否打 Safari 补丁。
Node mock 若直接用 `dist/manifest.json`（未经过 `safari:package` 改写），
`IS_SAFARI` 恒为 false，**所有 `tabs.*` 补丁都不会安装**，
于是 `tabs.create` 带着 `openerTabId` 直连 mock，报「读不到 windowId」——
很容易误判成产品 bug。验证时要么加 `--safari` 注入 `manifest.fork`，要么用
`/Applications` 里已被 `package-safari.mjs` 改写过的 manifest。

同理，`dist/` 里是上一轮构建产物。改完源码先 `pnpm build:safari-extension` 再跑 mock，
否则验证的是旧 bundle（曾出现 src 改动比 dist 新 4 分钟却以为是产品问题的排查弯路）。

## 10. 定位压缩产物的报错位置

弹窗里报 `bt@popup/index.js:1:23871` 时，直接按列号切片打印上下文最快：

```bash
node -e "
const s = require('fs').readFileSync('dist/popup/index.js','utf8');
console.log(JSON.stringify(s.slice(23871-200, 23871+200)));
"
```

本例里第 23871 列正是 `[cached, data, [failure]] = ...` 的解构 `[`，
一眼看出是返回值 `undefined`。
