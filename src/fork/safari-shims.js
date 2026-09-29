/*
 * Safari 的能力差异（不是“整个 API 缺失”）：
 * 1. `tabs.query({url})` 不支持 url 过滤；
 * 2. `webRequest` 不接受 `blocking` extraInfoSpec。
 * 这里在真实 API 上包一层，让上游调用点保持原样。
 */
import { IS_SAFARI } from './target';

const kPatched = Symbol('forkPatched');

/** 为 tabs.query 补 url 过滤：按去掉 hash 的地址匹配 */
function patchTabsQuery() {
  const tabs = globalThis.chrome?.tabs || globalThis.browser?.tabs;
  const query = tabs?.query;
  if (typeof query !== 'function' || query[kPatched]) return;
  const patched = async (queryInfo = {}) => {
    const { url, ...rest } = queryInfo;
    const list = await query.call(tabs, url ? rest : queryInfo);
    if (!url) return list;
    const base = url.split('#', 1)[0];
    return list.filter(tab => tab?.url?.split('#', 1)[0] === base);
  };
  patched[kPatched] = true;
  tabs.query = patched;
}

/** 让 webRequest 的 addListener 忽略 blocking，Safari 会因它抛错 */
function patchWebRequestBlocking() {
  const wr = globalThis.chrome?.webRequest || globalThis.browser?.webRequest;
  if (!wr) return;
  const strip = args => args.map(arg => (
    Array.isArray(arg) ? arg.filter(v => v !== 'blocking') : arg
  ));
  for (const key in wr) {
    const event = wr[key];
    const add = event?.addListener;
    if (typeof add !== 'function' || add[kPatched]) continue;
    const patched = (...args) => add.call(event, ...strip(args));
    patched[kPatched] = true;
    event.addListener = patched;
  }
}

if (IS_SAFARI) {
  patchTabsQuery();
  patchWebRequestBlocking();
}

export { IS_SAFARI };
