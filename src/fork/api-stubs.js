import { noop } from '@/common';
import { describeError, forkLog, safePatch, trySet } from './guard';

const kPatched = Symbol('forkPatched');

/*
 * Safari 等环境缺少部分浏览器 API。这里只补齐“语义等价的空实现”，
 * 让上游代码无需改写即可运行（上游调用点保持原样，不做可选链兜底）。
 * 只补缺失成员，不覆盖浏览器已提供的实现。
 *
 * 注意：所有写入都必须走 trySet。Safari 的部分扩展 API 成员是只读的，
 * 严格模式下给只读属性赋值会抛 TypeError；这里只要有一处抛错未被捕获，
 * 整个后台 bundle 就会在求值阶段中止，`runtime.onMessage` 不会注册，
 * 于是 popup 能渲染但所有菜单点击都无响应。
 */

/** 事件对象空实现：监听即无效但不报错 */
const makeEvent = () => ({
  addListener: noop,
  removeListener: noop,
  hasListener: () => false,
  hasListeners: () => false,
});

/**
 * 空实现必须同时兼容两种调用方式：
 * - 回调式：`chrome.xxx(cb)`（Safari 的原生形态）
 * - Promise 式：不传回调
 *
 * MV2 下 `src/common/browser.js` 的 wrapAsync 一律以 `fn(...args, cb)` 调用，
 * 并且**不使用**被调用函数的返回值。如果 stub 只返回 Promise 而不调用 cb，
 * 外层 Promise 就永远 pending —— 上游 `initializeDatabase()` / `init` 会卡死，
 * 表现就是 popup 能画出来、但点任何菜单都没有反应。
 *
 * @param {any | (() => any)} value 固定返回值或返回值的工厂
 */
const stubFn = value => (...args) => {
  const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
  const res = typeof value === 'function' ? value() : value;
  if (!cb) return Promise.resolve(res);
  setTimeout(cb, 0, res);
};

/** @param {string} name 命名空间名 @param {Object} members 需要确保存在的成员 */
function fillNamespace(name, members) {
  // 后台同时写 chrome 与 browser：MV3 下 browser 就是 chrome，
  // MV2 下 browser 是 polyfill 代理，真实源对象是 chrome。
  for (const ns of [globalThis.chrome, globalThis.browser]) {
    if (!ns) continue;
    let group = ns[name];
    if (!group) {
      group = { __proto__: null };
      if (!trySet(ns, name, group, `${name}`)) continue;
    }
    for (const key in members) {
      if (group[key] === undefined) {
        trySet(group, key, members[key], `${name}.${key}`);
      }
    }
  }
}

/**
 * 规整某个方法的回调/Promise 返回值类型。
 *
 * 有些 API 在 Safari 的特定场景下会成功回调但给出 `undefined`
 * （例如没有窗口权限时的 `windows.getAll`）。上游会直接解构使用：
 * `[wnd] = await browserWindows.getAll()` → 抛 `undefined is not iterable`。
 * 这个异常会让 `init` 的依赖 reject，而 `resolveInit()` 只在依赖全部成功后才执行，
 * 于是 init 永远不完成，`handleCommandMessage` 里 `if (init) return init.then(...)`
 * 会把**所有**后台命令挂起 —— popup 能画出来，但点任何菜单都没有反应。
 *
 * @param {string} name 命名空间名
 * @param {string} method 方法名
 * @param {(res: any) => any} normalize 把结果规整成上游期望的类型
 */
function patchResult(name, method, normalize) {
  for (const ns of [globalThis.chrome, globalThis.browser]) {
    const group = ns?.[name];
    const fn = group?.[method];
    if (typeof fn !== 'function' || fn[kPatched]) continue;
    const patched = (...args) => {
      const i = args.length - 1;
      const cb = typeof args[i] === 'function' ? args[i] : null;
      if (cb) {
        args[i] = res => cb(normalize(res));
        return fn.apply(group, args);
      }
      const out = fn.apply(group, args);
      return out && typeof out.then === 'function' ? out.then(normalize) : out;
    };
    patched[kPatched] = true;
    trySet(group, method, patched, `${name}.${method}`);
  }
}

const asArray = res => (Array.isArray(res) ? res : []);
const asObject = res => (res && typeof res === 'object' ? res : {});

safePatch('webRequest-stubs', () => fillNamespace('webRequest', {
  onBeforeRequest: makeEvent(),
  onBeforeSendHeaders: makeEvent(),
  onHeadersReceived: makeEvent(),
  onSendHeaders: makeEvent(),
  onErrorOccurred: makeEvent(),
  onCompleted: makeEvent(),
  OnBeforeSendHeadersOptions: {},
  OnHeadersReceivedOptions: {},
}));

safePatch('notifications-stubs', () => fillNamespace('notifications', {
  create: stubFn(''),
  clear: stubFn(true),
  getAll: stubFn({}),
  onClicked: makeEvent(),
  onClosed: makeEvent(),
  onShown: makeEvent(),
  onButtonClicked: makeEvent(),
}));

safePatch('permissions-stubs', () => fillNamespace('permissions', {
  contains: stubFn(false),
  request: stubFn(false),
  remove: stubFn(false),
  getAll: stubFn({ permissions: [], origins: [] }),
  onAdded: makeEvent(),
  onRemoved: makeEvent(),
}));

/*
 * Safari 的 windows 实现是完整的，但 `getAll()` 等在不支持的场景下可能返回 undefined，
 * 上游 `ua.js` 会直接 `[wnd] = await browserWindows.getAll()` 解构，
 * 拿到 undefined 就抛 `undefined is not iterable`，进而让 init 依赖 reject、
 * `resolveInit()` 不执行，所有后台命令永久挂起。这里只兜底返回值类型。
 */
safePatch('windows-stubs', () => fillNamespace('windows', {
  getAll: stubFn(() => []),
  getCurrent: stubFn(() => ({})),
  getLastFocused: stubFn(() => ({})),
  create: stubFn(() => ({})),
  update: stubFn(() => ({})),
  onCreated: makeEvent(),
  onFocusChanged: makeEvent(),
  onBoundsChanged: makeEvent(),
  onRemoved: makeEvent(),
}));
// Safari 在部分场景下这些方法会成功回调但给出 undefined
safePatch('windows-result', () => {
  patchResult('windows', 'getAll', asArray);
  patchResult('windows', 'getCurrent', asObject);
  patchResult('windows', 'getLastFocused', asObject);
});

/*
 * Safari 的 permissions.contains 对未知权限名（如 `downloads`）会**同步抛错**，
 * 而上游 `permissions.js` 在模块顶层调用它。同步抛错会中止整个后台 bundle，
 * 导致 `runtime.onMessage` 不注册 —— 这就是「弹窗能打开、点任何菜单都没反应」的根因。
 *
 * 两个层面处理：
 * 1. 先把 Safari 不认识的权限名从请求里剔除（本来就是它不支持的，语义上等价于“没有”）
 * 2. 仍然包一层 try/catch 兜底，把异常转成“没有该权限”，绝不让它冒到上游
 */
const SAFARI_UNKNOWN_PERMISSIONS = ['downloads'];

safePatch('permissions-contains-guard', () => {
  for (const ns of [globalThis.chrome, globalThis.browser]) {
    const group = ns?.permissions;
    const fn = group?.contains;
    if (typeof fn !== 'function' || fn[kPatched]) continue;
    /** 剔除 Safari 不认识、会直接抛错的权限名 */
    const sanitize = permissions => {
      if (!permissions || typeof permissions !== 'object') return permissions;
      const list = permissions.permissions;
      if (!Array.isArray(list)) return permissions;
      const kept = list.filter(name => !SAFARI_UNKNOWN_PERMISSIONS.includes(name));
      return kept.length === list.length ? permissions : { ...permissions, permissions: kept };
    };
    const patched = (...args) => {
      const i = args.length - 1;
      const cb = typeof args[i] === 'function' ? args[i] : null;
      // 两种调用方式（(req, cb) 与 (req)）下请求对象都在索引 0
      if (args[0] && typeof args[0] === 'object') {
        args[0] = sanitize(args[0]);
      }
      const safeCb = cb && (res => cb(res === true));
      try {
        return cb ? fn.apply(group, [...args.slice(0, i), safeCb]) : fn.apply(group, args);
      } catch (err) {
        forkLog('permissions.contains 抛错，按无权限处理', describeError(err));
        return cb ? setTimeout(cb, 0, false) : Promise.resolve(false);
      }
    };
    patched[kPatched] = true;
    trySet(group, 'contains', patched, 'permissions.contains');
  }
});

// Safari 没有 File System Access API：给出不含该方法的类，
// 上游 `DataTransferItem.prototype.getAsFileSystemHandle` 取到 undefined，
// 拖拽安装会按“不支持”分支安静跳过。
safePatch('DataTransferItem-stub', () => {
  if (!globalThis.DataTransferItem) {
    globalThis.DataTransferItem = class DataTransferItem {};
  }
});

// Safari 的 storage.local.get() 不接受 undefined，必须显式传 null。
// 必须透传其余参数：MV2 下 `browser.js` 的 wrapAsync 会调用 `fn(keys, cb)`，
// 若这里只接收 keys，回调会被丢掉，Promise 永远不会 resolve，
// 进而 initializeDatabase() 卡死、init 不完成，后台所有命令都被挂起。
safePatch('storage.get-undefined', () => {
  for (const ns of [globalThis.chrome, globalThis.browser]) {
    const area = ns?.storage?.local;
    const original = area?.get;
    if (typeof original === 'function' && !original[kPatched]) {
      const patched = (...args) => {
        if (!args.length || args[0] === undefined) args[0] = null;
        return original.apply(area, args);
      };
      patched[kPatched] = true;
      trySet(area, 'get', patched, 'storage.local.get');
    }
  }
});

// Safari 可能不提供 chrome.extension.isAllowedFileSchemeAccess
safePatch('isAllowedFileSchemeAccess', () => {
  const ext = globalThis.chrome?.extension;
  if (ext && ext.isAllowedFileSchemeAccess === undefined) {
    trySet(ext, 'isAllowedFileSchemeAccess', cb => cb(false), 'extension.isAllowedFileSchemeAccess');
  }
});
