/*
 * 早期崩溃取证与安全打补丁。
 *
 * 必须最先导入（见 `src/fork/index.js`），原因如下：
 * Safari 的后台页一旦在**求值阶段**抛错，整个 bundle 就中止，
 * `runtime.onMessage` 监听器不会注册。此时弹窗仍能渲染，
 * 但 `sendCmdDirectly('InitPopup')` 拿不到响应（返回 undefined），
 * 表现就是“点扩展图标能出菜单，点菜单里任何一项都没反应”。
 *
 * 这里做两件事：
 * 1. 最早安装 error / unhandledrejection 监听，把崩溃栈写进 localStorage，
 *    弹窗页（同源）可以读出来显示，便于在没有 devtools 的情况下定位。
 * 2. 提供 `safePatch`，让 fork 层的每个补丁互不牵连：
 *    给 Safari 只读属性赋值会抛 TypeError，绝不能让一处失败拖垮整个后台。
 */
import { forkLog } from './log';

export { forkLog };

const kGuardInstalled = Symbol('forkGuard');

/** 把异常整理成短文本，避免 localStorage 里塞太多内容 */
export function describeError(err) {
  if (!err) return 'unknown';
  const msg = err.message || String(err);
  const stack = err.stack
    ? ` <${`${err.stack}`.split('\n').slice(0, 5).map(s => s.trim()).join(' <- ')}>`
    : '';
  return msg + stack;
}

/**
 * 安全执行一段补丁代码。失败只记录，不中断后续补丁和上游模块求值。
 * @param {string} label 补丁名，用于定位
 * @param {() => any} fn 补丁本体
 * @return {any} fn 的返回值；失败时为 undefined
 */
export function safePatch(label, fn) {
  try {
    return fn();
  } catch (err) {
    forkLog(`补丁失败(${label})`, describeError(err));
  }
}

/**
 * 给对象属性赋值，失败只记录。
 * Safari 的部分扩展 API 成员是只读的（简单赋值会被静默忽略），
 * 因此再尝试一次 `Object.defineProperty`（可配置属性可以这样覆盖）。
 * @return {boolean} 是否写入成功
 */
export function trySet(obj, key, value, label) {
  const name = label || key;
  try {
    obj[key] = value;
    if (obj[key] === value) return true;
  } catch (err) {
    forkLog(`属性只读(${name})`, describeError(err));
  }
  try {
    // 有些实现是「只有 getter 的访问器」，只能改属性描述符
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    if (obj[key] === value) return true;
  } catch {/*ignore*/}
  forkLog(`属性写入无效(${name})`);
  return false;
}

function installGuard() {
  if (globalThis[kGuardInstalled]) return;
  globalThis[kGuardInstalled] = true;
  // 启动标记：弹窗里若只看到这一条而没有“init 完成”，说明后台中途崩了
  forkLog('页面脚本开始求值', `${location?.href || ''}`);
  addEventListener('error', evt => {
    forkLog('未捕获异常', describeError(evt.error) || evt.message);
  });
  addEventListener('unhandledrejection', evt => {
    forkLog('未处理的 Promise 异常', describeError(evt.reason));
  });
}

installGuard();
