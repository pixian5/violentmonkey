import { noop } from '@/common';

const kPatched = Symbol('forkPatched');

/*
 * Safari 等环境缺少部分浏览器 API。这里只补齐“语义等价的空实现”，
 * 让上游代码无需改写即可运行（上游调用点保持原样，不做可选链兜底）。
 * 只补缺失成员，不覆盖浏览器已提供的实现。
 */

/** 事件对象空实现：监听即无效但不报错 */
const makeEvent = () => ({
  addListener: noop,
  removeListener: noop,
  hasListener: () => false,
  hasListeners: () => false,
});

/** @param {string} name 命名空间名 @param {Object} members 需要确保存在的成员 */
function fillNamespace(name, members) {
  // 后台同时写 chrome 与 browser：MV3 下 browser 就是 chrome，
  // MV2 下 browser 是 polyfill 代理，真实源对象是 chrome。
  for (const ns of [globalThis.chrome, globalThis.browser]) {
    if (!ns) continue;
    let group = ns[name];
    if (!group) {
      group = ns[name] = { __proto__: null };
      if (__.DEV) console.info(`[fork] 补齐缺失的 ${name} API`);
    }
    for (const key in members) {
      if (group[key] === undefined) group[key] = members[key];
    }
  }
}

fillNamespace('webRequest', {
  onBeforeRequest: makeEvent(),
  onBeforeSendHeaders: makeEvent(),
  onHeadersReceived: makeEvent(),
  onSendHeaders: makeEvent(),
  onErrorOccurred: makeEvent(),
  onCompleted: makeEvent(),
  OnBeforeSendHeadersOptions: {},
  OnHeadersReceivedOptions: {},
});

fillNamespace('notifications', {
  create: async () => '',
  clear: async () => true,
  onClicked: makeEvent(),
  onClosed: makeEvent(),
});

fillNamespace('permissions', {
  contains: async () => false,
  request: async () => false,
  onAdded: makeEvent(),
  onRemoved: makeEvent(),
});

fillNamespace('windows', {
  getAll: async () => [],
  getCurrent: async () => ({}),
  getLastFocused: async () => ({}),
  create: async () => ({}),
  update: async () => ({}),
  onCreated: makeEvent(),
  onFocusChanged: makeEvent(),
  onBoundsChanged: makeEvent(),
});

// Safari 没有 File System Access API：给出不含该方法的类，
// 上游 `DataTransferItem.prototype.getAsFileSystemHandle` 取到 undefined，
 // 拖拽安装会按“不支持”分支安静跳过。
if (!globalThis.DataTransferItem) {
  globalThis.DataTransferItem = class DataTransferItem {};
}

// Safari 的 storage.local.get() 不接受 undefined，必须显式传 null
for (const ns of [globalThis.chrome, globalThis.browser]) {
  const area = ns?.storage?.local;
  const original = area?.get;
  if (typeof original === 'function' && !original[kPatched]) {
    const patched = keys => original.call(area, keys === undefined ? null : keys);
    patched[kPatched] = true;
    area.get = patched;
  }
}

// Safari 可能不提供 chrome.extension.isAllowedFileSchemeAccess
for (const ns of [globalThis.chrome]) {
  const ext = ns?.extension;
  if (ext && ext.isAllowedFileSchemeAccess === undefined) {
    ext.isAllowedFileSchemeAccess = cb => cb(false);
  }
}
