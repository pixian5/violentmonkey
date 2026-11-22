/*
 * 后台诊断日志。
 *
 * Safari 的扩展后台没有 devtools 面板可直接打开，出问题时只能靠日志判断
 * “后台到底有没有启动、卡在哪一步、init 有没有做完、哪个命令报错了”。
 * 日志统一写入 localStorage（键 `fork:log`），弹窗页与后台同源，
 * 因此可以在弹窗里直接看到，也能被注入脚本读出。
 *
 * 特别地：上游 `background/index.js` 的 `handleCommandMessage` 在 init 未完成时
 * 会把所有命令挂起（`if (init) return init.then(...)`），所以只要 init 卡住，
 * 弹窗能画出来但点任何菜单都没有反应。这里对 init 加一个超时看门狗。
 */
import { commands, init } from '@/background/utils/init';
import { describeError, forkLog } from './guard';
import { safePatch } from './guard';

/** init 超过这个时间还没完成，基本可以确定卡在了某个 API 上 */
const INIT_WARN_TIMEOUT = 10e3;
/** 出错时把命令名和参数记下来，便于复现 */
const DATA_PREVIEW_LIMIT = 300;

forkLog('后台模块全部加载完成', `manifest=${chrome.runtime.getManifest().manifest_version}`);

if (init) {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) {
      forkLog(`init 超过 ${INIT_WARN_TIMEOUT / 1000}s 仍未完成，后台命令会全部挂起`);
    }
  }, INIT_WARN_TIMEOUT);
  init.then(() => {
    settled = true;
    clearTimeout(timer);
    forkLog('init 完成，后台命令已就绪');
  }, err => {
    settled = true;
    clearTimeout(timer);
    forkLog('init 失败', describeError(err));
  });
} else {
  forkLog('init 已同步完成');
}

/*
 * 命令级错误日志。
 *
 * 弹窗里点菜单项后，若命令在后台抛错，弹窗只会关闭或静默失败，
 * 用户完全看不到原因。这里给所有命令包一层：只在失败时记录，
 * 成功路径零开销（仅一次 try/catch）。
 *
 * 时机很重要：fork 层先于上游模块求值，此时 `commands` 还是空的，
 * 所以必须放到微任务里——整个 bundle（含所有上游模块）同步求值完成后才执行。
 *
 * 注意：`commands` 里既有函数也有字符串（MV3 offscreen），这里只包装函数。
 */
Promise.resolve().then(() => safePatch('command-error-log', () => {
  for (const name in commands) {
    const fn = commands[name];
    if (typeof fn !== 'function' || fn.__forkLogged) continue;
    const wrapped = function wrappedCommand(...args) {
      try {
        const out = fn.apply(this, args);
        if (out && typeof out.then === 'function') {
          return out.catch(err => {
            forkLog(`命令 ${name} 失败`, `${describeError(err)} :: 参数=${
              preview(args[0])
            }`);
            throw err;
          });
        }
        return out;
      } catch (err) {
        forkLog(`命令 ${name} 同步抛错`, `${describeError(err)} :: 参数=${preview(args[0])}`);
        throw err;
      }
    };
    wrapped.__forkLogged = true;
    // 保留 isOwn 等标记，否则权限检查会把扩展页命令误判为非法调用
    Object.assign(wrapped, fn);
    commands[name] = wrapped;
  }
}));

/** 只截取关键信息，避免日志里塞进整个脚本文本 */
function preview(data) {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return text && text.length > DATA_PREVIEW_LIMIT
      ? `${text.slice(0, DATA_PREVIEW_LIMIT)}...`
      : text;
  } catch {
    return typeof data;
  }
}
