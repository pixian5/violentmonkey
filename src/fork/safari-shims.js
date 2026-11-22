/*
 * Safari 的能力差异（不是“整个 API 缺失”）：
 * 1. `tabs.query({url})` 不支持 url 过滤；
 * 2. `webRequest` 不接受 `blocking` extraInfoSpec；
 * 3. `tabs.executeScript` 不接受 `runAt` / `frameId: undefined`。
 *
 * 这里在真实 API 上包一层，让上游调用点保持原样。
 * 所有写入都走 trySet：Safari 的部分 API 成员只读，严格模式下赋值会抛 TypeError，
 * 若未捕获会让整个后台 bundle 在求值阶段中止，表现为所有菜单点击无响应。
 */
import { safePatch, trySet } from './guard';
import { IS_SAFARI } from './target';

const kPatched = Symbol('forkPatched');

/** 为 tabs.query 补 url 过滤：按去掉 hash 的地址匹配 */
function patchTabsQuery() {
  const tabs = globalThis.chrome?.tabs || globalThis.browser?.tabs;
  const query = tabs?.query;
  if (typeof query !== 'function' || query[kPatched]) return;
  const filterByUrl = (list, url) => {
    if (!url || !Array.isArray(list)) return list;
    const base = url.split('#', 1)[0];
    return list.filter(tab => tab?.url?.split('#', 1)[0] === base);
  };
  /*
   * 必须同时支持两种调用方式：
   * 1. `browser.tabs.query(info, cb)` —— MV2 下 `browser.js` 的 wrapAsync 就是这么调的，
   *    若补丁是 async 函数、丢掉 cb，Promise 会永远不 resolve，
   *    于是 getActiveTab() 卡死、popup 收不到数据、后台命令全部无响应。
   * 2. `chrome.tabs.query(info)` —— 直接返回 Promise。
   */
  const patched = (queryInfo = {}, ...rest) => {
    const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : null;
    const { url, ...withoutUrl } = queryInfo || {};
    const arg = url ? withoutUrl : queryInfo;
    if (cb) {
      return query.call(tabs, arg, res => cb(filterByUrl(res, url)));
    }
    const out = query.call(tabs, arg);
    return out?.then ? out.then(res => filterByUrl(res, url)) : out;
  };
  patched[kPatched] = true;
  trySet(tabs, 'query', patched, 'tabs.query');
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
    trySet(event, 'addListener', patched, `webRequest.${key}.addListener`);
  }
}

/**
 * Safari 的 `tabs.executeScript` 不接受 `runAt`，传了会直接报错，
 * 而上游 `browser-scripts-api.js` 里 MV2 分支总是带上 `[RUN_AT]: runAt`。
 * 同时 Safari 也不接受 `frameId: undefined`。这里把这些不支持的键剥掉。
 */
function patchExecuteScript() {
  const tabs = globalThis.chrome?.tabs || globalThis.browser?.tabs;
  for (const method of ['executeScript', 'insertCSS', 'removeCSS']) {
    const fn = tabs?.[method];
    if (typeof fn !== 'function' || fn[kPatched]) continue;
    const patched = (...args) => {
      const details = args[1];
      if (details && typeof details === 'object') {
        const clean = { ...details };
        delete clean.runAt;
        delete clean.allFrames;
        delete clean.cssOrigin;
        delete clean.matchAboutBlank;
        if (clean.frameId === undefined) delete clean.frameId;
        args[1] = clean;
      }
      return fn.apply(tabs, args);
    };
    patched[kPatched] = true;
    trySet(tabs, method, patched, `tabs.${method}`);
  }
}

/** 建标签页时 Safari 不接受的字段 */
const TAB_CREATE_UNSUPPORTED = ['openerTabId', 'cookieStoreId', 'index'];

/**
 * Safari 的 `tabs.create` 对不认识的字段很敏感：
 * 上游 `TabOpen` 会带上 `openerTabId` / `cookieStoreId` / `index` / `windowId`，
 * 任一字段不被接受就整体失败，表现为「点菜单后弹窗关了却没打开面板」。
 * 这里先尝试原样调用，失败后逐级降级，最后只保留 `url`。
 */
function patchTabsCreate() {
  const tabs = globalThis.chrome?.tabs || globalThis.browser?.tabs;
  const create = tabs?.create;
  if (typeof create !== 'function' || create[kPatched]) return;
  /** 调用一次 create；回调式与 Promise 式都要支持 */
  const invoke = (details, cb) => (cb
    ? create.call(tabs, details, cb)
    : create.call(tabs, details));
  const patched = (details = {}, ...rest) => {
    const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : null;
    if (cb) {
      const done = res => cb(res);
      // 回调式无法感知失败原因，只能按顺序尝试
      let attempt = details;
      let dropped = 0;
      const tryNext = () => {
        invoke(attempt, res => {
          /*
           * 判定“这次是否失败”有两个信号：
           * 1. runtime.lastError 有值
           * 2. 成功但 res 为空/不是对象 —— Safari 偶发如此，
           *    上游 TabOpen 会立刻读 `newTab[kWindowId]` 而抛错。
           * 这时不能直接返回空，必须继续降级重试。
           */
          const errMsg = globalThis.chrome?.runtime?.lastError?.message;
          const bad = !res || typeof res !== 'object';
          if ((!errMsg && !bad) || dropped >= TAB_CREATE_UNSUPPORTED.length) {
            done(res);
            return;
          }
          const key = TAB_CREATE_UNSUPPORTED[dropped++];
          attempt = { ...attempt };
          delete attempt[key];
          tryNext();
        });
      };
      return tryNext();
    }
    // Promise 式：直接在返回值上做降级重试
    const attempt = (details2, left) => {
      const out = invoke(details2);
      if (!out || typeof out.catch !== 'function') return out;
      return out.then(res => {
        // Safari 可能“成功”但返回空对象，上游会立刻读 tab 属性而抛错
        if (res && typeof res === 'object') return res;
        if (!left.length) return res;
        const next = { ...details2 };
        delete next[left[0]];
        return attempt(next, left.slice(1));
      }, err => {
        if (!left.length) throw err;
        const next = { ...details2 };
        delete next[left[0]];
        return attempt(next, left.slice(1));
      });
    };
    return attempt(details, TAB_CREATE_UNSUPPORTED);
  };
  patched[kPatched] = true;
  trySet(tabs, 'create', patched, 'tabs.create');
}

if (IS_SAFARI) {
  safePatch('tabs.query', patchTabsQuery);
  safePatch('webRequest.blocking', patchWebRequestBlocking);
  safePatch('tabs.executeScript', patchExecuteScript);
  safePatch('tabs.create', patchTabsCreate);
}

export { IS_SAFARI };
