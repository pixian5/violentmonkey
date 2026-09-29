import { ignoreChromeErrors } from '@/common';

/**
 * 包装 `browserAction`/`action` API 的异步方法，让调用方总能拿到 Promise。
 *
 * 背景：Chrome 138+ 的 Promise 形 API 只有在“不传回调”时才返回 Promise；
 * 传回调（这里用于抑制 `no tab id` 之类的 `chrome.runtime.lastError`）时返回 undefined，
 * 旧式仅回调 API 同样返回 undefined。直接写 `api.method(...).catch(noop)` 会抛
 * `TypeError: Cannot read properties of undefined (reading 'catch')`，
 * 并中断同一函数中后续的角标与图标更新。Firefox Android 等不提供这些 API 时，
 * 这里也返回已完成的 Promise。
 * @param {Object} api - `chrome.action` 或 `chrome.browserAction`
 * @param {string[]} methods - 需要包装的方法名
 * @return {Object<string, function>} 只包含包装后方法的对象
 */
export default function wrapActionApi(api, methods) {
  const noopPromise = () => Promise.resolve();
  const res = { __proto__: null };
  for (const method of methods) {
    const fn = api?.[method];
    res[method] = fn
      ? (...args) => {
        let out;
        try {
          out = api::fn(...args, ignoreChromeErrors);
        } catch (e) {
          try {
            out = api::fn(...args);
          } catch {/*ignore*/
          }
        }
        return typeof out?.catch === 'function' ? out : Promise.resolve();
      }
      : noopPromise;
  }
  return res;
}
