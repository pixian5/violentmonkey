/*
 * fork 层诊断日志。
 *
 * Safari 的扩展后台没有 devtools 面板可直接打开，出问题时只能靠日志倒查。
 * 这里提供一条极轻量的日志通道：
 * 1. 写入内存缓冲（同一次运行内可读）
 * 2. 写入 localStorage（popup 与后台同源，可跨页面读取，便于从弹窗 UI 直接看到）
 *
 * 必须能在最早阶段使用，因此不依赖任何上游模块。
 */

const KEY = 'fork:log';
/** 只保留最近这么多条，避免 localStorage 无限增长 */
const MAX_LINES = 40;

const canStore = (() => {
  try {
    return !!globalThis.localStorage;
  } catch {
    return false;
  }
})();

/** @return {string[]} 已记录的日志（旧 → 新） */
export function readForkLogs() {
  if (!canStore) return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw && JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearForkLogs() {
  if (!canStore) return;
  try {
    localStorage.removeItem(KEY);
  } catch {/*ignore*/}
}

/** 把异常整理成一行可读文本 */
function formatError(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const msg = err.message || String(err);
  const stack = err.stack && `${err.stack}`.split('\n').slice(0, 4).join(' | ');
  return stack ? `${msg} <${stack}>` : msg;
}

/**
 * 记录一条后台日志。
 * @param {string} message
 * @param {any} [error] 可选异常或附加信息
 */
export function forkLog(message, error) {
  const line = `${new Date().toISOString().slice(11, 19)} ${message}${
    error === undefined ? '' : ` :: ${formatError(error)}`
  }`;
  try {
    console.info('[fork]', line);
  } catch {/*ignore*/}
  if (!canStore) return;
  try {
    const list = readForkLogs();
    list.push(line);
    if (list.length > MAX_LINES) list.splice(0, list.length - MAX_LINES);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {/*ignore*/}
}
