import { getUniqId, makePause, sendCmdDirectly } from '@/common';
import { IS_SAFARI } from './target';

/*
 * 脚本解析的传输通道：优先走 runtime port 分块传输， Safari 或端口失败时
 * 回退到 storage 中转（`ParseScriptFromStorage` 命令由 src/fork/db-extensions.js 提供）。
 * 从 `vm-import.vue` 抽出，避免这些机制散落在上游文件里。
 */

const IMPORT_PORT_NAME = 'importScript';
const IMPORT_CHUNK_SIZE = 64 * 1024;
const IMPORT_PORT_READY_TIMEOUT = 1500;
const IMPORT_PORT_READY_RETRY = 3;
const IMPORT_STORAGE_PREFIX = 'import:code:';
const IMPORT_USE_STORAGE = IS_SAFARI;

/**
 * 解析并安装一个脚本。
 * @param {Object} data 脚本元数据
 * @param {string} code 脚本代码
 * @param {string} filename 用于错误提示
 * @param {Object} deps
 * @param {(text: string) => void} [deps.reportDebug]
 * @param {(promise: Promise, timeout: number, label?: string) => Promise} deps.withTimeout
 */
export async function parseScriptForImport(data, code, filename, deps) {
  const { reportDebug } = deps;
  const canUseStorage = !!browser?.storage?.local?.set;
  if (IMPORT_USE_STORAGE && canUseStorage) {
    return parseScriptViaStorage(data, code, filename, deps);
  }
  try {
    return await parseScriptViaPort(data, code, filename, deps);
  } catch (err) {
    reportDebug?.(`端口解析失败，尝试存储: ${err?.message || err}`);
    if (canUseStorage) {
      return parseScriptViaStorage(data, code, filename, deps);
    }
    throw err;
  }
}

async function parseScriptViaPort(data, code, filename) {
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: IMPORT_PORT_NAME });
    let done = false;
    let ready = false;
    let startAttempts = 0;
    let startTimer;
    let chunkTaskStarted = false;
    const finish = (err, result) => {
      if (done) return;
      done = true;
      clearTimeout(startTimer);
      try { port.disconnect(); } catch (e) { /* ignore */ }
      if (err) reject(err);
      else resolve(result);
    };
    port.onMessage.addListener(msg => {
      if (done) return;
      if (msg?.type === 'ready') {
        ready = true;
        clearTimeout(startTimer);
        if (!chunkTaskStarted) {
          chunkTaskStarted = true;
          sendChunks();
        }
        return;
      }
      if (msg?.ok) finish(null, msg.result);
      else if (msg?.error) finish(new Error(msg.error));
    });
    port.onDisconnect.addListener(() => {
      if (!done) finish(new Error(`导入端口断开: ${filename}`));
    });
    const sendStart = () => {
      if (done || ready) return;
      startAttempts += 1;
      try {
        port.postMessage({ type: 'start', data: { ...data, code: undefined } });
      } catch (e) {
        finish(e);
        return;
      }
      if (startAttempts < IMPORT_PORT_READY_RETRY) {
        startTimer = setTimeout(sendStart, IMPORT_PORT_READY_TIMEOUT);
      } else {
        startTimer = setTimeout(() => {
          if (!ready && !done) finish(new Error(`导入端口未就绪: ${filename}`));
        }, IMPORT_PORT_READY_TIMEOUT);
      }
    };
    const sendChunks = async () => {
      try {
        const codeLen = code.length;
        for (let i = 0; i < codeLen; i += IMPORT_CHUNK_SIZE) {
          port.postMessage({ type: 'chunk', chunk: code.slice(i, i + IMPORT_CHUNK_SIZE) });
          if (i && i % (IMPORT_CHUNK_SIZE * 8) === 0) {
            await makePause(0);
          }
        }
        port.postMessage({ type: 'end' });
      } catch (err) {
        finish(err);
      }
    };
    sendStart();
  });
}

async function parseScriptViaStorage(data, code, filename, deps) {
  const { reportDebug, withTimeout } = deps;
  const codeKey = `${IMPORT_STORAGE_PREFIX}${getUniqId()}`;
  reportDebug?.(`写入临时脚本: ${filename}`);
  try {
    await withTimeout(
      browser.storage.local.set({ [codeKey]: code }),
      20000,
      `写入脚本超时: ${filename}`
    );
    return await withTimeout(
      sendCmdDirectly(
        'ParseScriptFromStorage',
        { ...data, codeKey },
        { retry: true, bgTimeout: 1200 }
      ),
      120000,
      `ParseScript 超时: ${filename}`
    );
  } finally {
    browser.storage.local.remove(codeKey).catch(() => {});
  }
}
