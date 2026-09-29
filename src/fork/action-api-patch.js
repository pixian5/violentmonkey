import wrapActionApi from './action-api';

/*
 * Chrome 138+ 的 `chrome.action` 只有在“不传回调”时才返回 Promise，
 * 传回调（抑制 chrome.runtime.lastError）时返回 undefined。
 * 上游 `icon.js` 直接写 `browserAction.setTitle({...}).catch(noop)`，
 * 这里包一层方法，让上游文件保持原样。
 */
const api = globalThis.chrome?.action;
if (api && __.MV3) {
  Object.assign(api, wrapActionApi(api, [
    'setIcon',
    'setBadgeText',
    'setBadgeBackgroundColor',
    'setTitle',
  ]));
}
