/*
 * 导入流程的自有增强。
 *
 * 这些内容原先写在 `options/views/tab-settings/vm-import.vue` 里（200 多行），
 * 搬到 fork 层之后，上游那个 Vue 文件只剩按钮和调用行：
 * 合并上游时即使两边都改了导入页，冲突也只会落在几行调用上，
 * 不会撞上分块写入、端口等待、调试通道这些自有实现。
 */
import { makePause, sendCmdDirectly } from '@/common';
import { listenOnce } from '@/common/browser';
import options from '@/common/options';
import { FORK_TARGET } from './target';
import { parseScriptForImport } from './script-import';
import { withTimeout } from './txt-transfer';

const VALUE_BATCH_BYTES = 256 * 1024;
const VALUE_BATCH_COUNT = 10;
const PORT_READY_TIMEOUT = 1500;
const DEBUG_FLAG = 'vmImportDebug';

/**
 * 导入调试默认关闭。需要排查时在扩展页面控制台执行：
 * `localStorage.setItem('vmImportDebug', '1')` 再打开设置页。
 * @return {boolean}
 */
export function isImportDebugEnabled() {
  try {
    return globalThis.localStorage?.getItem(DEBUG_FLAG) === '1';
  } catch {
    return false;
  }
}

/** @return {string} 调试面板上的环境标签 */
export function getImportDebugLabel() {
  return `导入调试: TARGET=${FORK_TARGET || 'unknown'} VM_VER=${__.VM_VER || 'n/a'}`;
}

/**
 * 报告写入器：与上游 `report()` 行为一致，额外提供 debug 级别。
 * @param {Array} reports 界面上的报告数组
 */
export function createImportReporter(reports) {
  const push = (text, name, type = 'critical') => {
    const message = text && (text.message || text.code) ? (text.message || text.code) : `${text}`;
    reports.push({ text: message, name, type });
  };
  const reportDebug = isImportDebugEnabled()
    ? text => push(text, '', 'debug')
    : () => {};
  return { report: push, reportDebug };
}

/**
 * 文件选择：Safari 下 `input.click()` 要求元素在文档里且可见度不为 0，
 * 这里把 input 挪到屏幕外而不是用 display:none，并给出取消/超时反馈。
 * @param {string} accept 接受的文件类型
 * @param {(file: File) => void} onPick 选中回调
 * @param {(text: string) => void} onDebug 调试输出
 */
export function pickFileForImport(accept, onPick, onDebug = () => {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.position = 'fixed';
  input.style.left = '-1000px';
  input.style.top = '0';
  input.style.opacity = '0';
  input.style.width = '1px';
  input.style.height = '1px';
  let picked = false;
  let waitingTimer;
  const cleanup = () => {
    clearTimeout(waitingTimer);
    removeEventListener('focus', onFocus, true);
  };
  const onFocus = () => {
    if (!picked) onDebug('可能未选择文件');
    cleanup();
  };
  input.onchange = () => {
    picked = true;
    const file = input.files?.[0];
    onDebug(file ? `选择文件: ${file.name} (${file.size} bytes)` : '未选择文件');
    cleanup();
    onPick(file);
    input.remove();
  };
  input.addEventListener?.('cancel', () => {
    onDebug('文件选择已取消');
    cleanup();
  });
  document.body.append(input);
  onDebug('触发文件选择');
  input.click();
  waitingTimer = setTimeout(() => onDebug('等待选择文件...'), 400);
  addEventListener('focus', onFocus, true);
}

/**
 * 等待后台端口就绪，避免 MV3/Safari 下 connect 之后立刻发消息被丢弃。
 * @return {Promise<boolean>} 是否在超时前收到首条消息
 */
export function waitPortReady(port, timeout = PORT_READY_TIMEOUT) {
  return new Promise(resolve => {
    let done;
    const finish = ok => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const timer = setTimeout(finish, timeout, false);
    port.onMessage::listenOnce(() => {
      clearTimeout(timer);
      finish(true);
    });
    port.onDisconnect?.addListener(() => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

/**
 * 分块写入脚本数据：单次消息体过大时 Safari 会静默丢弃。
 * @param {Object} data uri -> 数据存储
 * @param {(text: string) => void} onDebug
 */
export async function sendValueStoresBatched(data, onDebug = () => {}) {
  const entries = Object.entries(data);
  const total = entries.length;
  if (!total) return;
  let batch = {};
  let batchBytes = 0;
  let sent = 0;
  const flush = async () => {
    const payload = batch;
    batch = {};
    batchBytes = 0;
    await withTimeout(
      sendCmdDirectly('SetValueStores', payload, { retry: true, bgTimeout: 1200 }),
      20000,
      `SetValueStores 超时 (${sent}/${total})`
    );
    await makePause(0);
  };
  for (const [key, valueStore] of entries) {
    let size = 0;
    try { size = JSON.stringify(valueStore).length; } catch { /* 数据无法序列化时按 0 计 */ }
    const approx = String(key).length + size + 8;
    if (batchBytes && (
      batchBytes + approx > VALUE_BATCH_BYTES
      || Object.keys(batch).length >= VALUE_BATCH_COUNT
    )) {
      await flush();
      onDebug(`写入脚本数据进度: ${sent}/${total}`);
    }
    batch[key] = valueStore;
    batchBytes += approx;
    sent += 1;
  }
  if (Object.keys(batch).length) await flush();
  onDebug(`写入脚本数据完成: ${sent}/${total}`);
}

/**
 * 重建后台脚本索引；后台还没有该命令时回退到 `CheckPosition`。
 * @param {(text: string) => void} onDebug
 */
export async function rebuildIndexOrCheckPosition(onDebug = () => {}) {
  try {
    await withTimeout(
      sendCmdDirectly('RebuildScriptIndex', null, { retry: true, bgTimeout: 1200 }),
      20000,
      'RebuildScriptIndex 超时'
    );
    onDebug('已重建后台脚本索引');
  } catch (e) {
    onDebug(`重建索引失败，回退检查位置: ${e?.message || e}`);
    await withTimeout(
      sendCmdDirectly('CheckPosition', null, { retry: true, bgTimeout: 1200 }),
      15000,
      'CheckPosition 超时'
    );
  }
}

/**
 * 导入后刷新：后台已有脚本而界面列表仍为空时重新加载页面。
 * @param {Object} opts
 * @param {Object} opts.store 选项页的脚本列表状态
 * @param {(text: string) => void} opts.onDebug
 */
export async function refreshAfterImport({ store, onDebug = () => {} } = {}) {
  try {
    await options.ready;
    const data = await sendCmdDirectly('GetData', { sizes: true }, { retry: true });
    const count = data?.scripts?.length || 0;
    onDebug(`导入后后台脚本数: ${count}`);
    if (count && !store?.scripts?.length) {
      onDebug('导入后刷新页面');
      setTimeout(() => location.reload(), 200);
    }
  } catch (e) {
    onDebug(`导入后刷新失败: ${e?.message || e}`);
  }
}

/** @return {boolean} 是否为纯对象（上游 `isObject` 会把数组也算进去） */
export const isPlainObject = val => !!val && typeof val === 'object' && !Array.isArray(val);

/**
 * 组装 TXT 导入需要的依赖，供 `runInBatch` 使用。
 * @param {Object} opts
 * @param {Array} opts.reports 报告数组
 * @param {Object} opts.store 选项页状态
 * @param {Object} opts.options 选项存储（默认取全局 options）
 */
export function createImportDeps({ reports, store, options: opts = options } = {}) {
  const { report, reportDebug } = createImportReporter(reports);
  return {
    report,
    reportDebug,
    options: opts,
    parseScriptForImport: (data, code, filename) => parseScriptForImport(data, code, filename, {
      reportDebug,
      withTimeout,
    }),
    sendValues: values => sendValueStoresBatched(values, reportDebug),
    refreshAfterImport: () => refreshAfterImport({ store, onDebug: reportDebug }),
  };
}
