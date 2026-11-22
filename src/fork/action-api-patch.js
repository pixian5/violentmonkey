import wrapActionApi from './action-api';

/*
 * 工具栏 API 兼容层。
 *
 * 1. Chrome 138+ 的 `chrome.action` 只有在“不传回调”时才返回 Promise，
 *    传回调（抑制 chrome.runtime.lastError）时返回 undefined。
 *    上游 `icon.js` 直接写 `browserAction.setTitle({...}).catch(noop)`，
 *    这里包一层方法，让上游文件保持原样。
 * 2. Safari 不提供 MV2 的 `browserAction`（只有 MV3 的 `action`），
 *    而上游 `icon.js` 用 `browser[__.MV3 ? 'action' : 'browserAction']` 取值，
 *    在 Safari 的 MV2 构建里得到 undefined，导致 `Run`、`SetBadge` 等
 *    后台命令直接抛 TypeError，popup 里的操作全部静默失效。
 *    这里为缺失的命名空间补一套安全实现（优先用真实 `action`，否则 no-op）。
 */

const ACTION_METHODS = [
  'setIcon',
  'setBadgeText',
  'setBadgeBackgroundColor',
  'setTitle',
];

const noopEvent = () => ({
  addListener() {},
  removeListener() {},
  hasListener: () => false,
  hasListeners: () => false,
});

/** 原样返回事件对象，保证 `browserAction.onClicked.addListener` 之类调用不报错 */
const ACTION_EVENTS = ['onClicked'];

for (const ns of [globalThis.chrome, globalThis.browser]) {
  if (!ns) continue;
  let api = ns.action || ns.browserAction;
  if (!api) {
    // Safari MV2：两个命名空间都没有，补一套安全实现
    api = ns.browserAction = { __proto__: null };
  }
  Object.assign(api, wrapActionApi(api, ACTION_METHODS));
  for (const evt of ACTION_EVENTS) {
    if (api[evt] === undefined) api[evt] = noopEvent();
  }
}
