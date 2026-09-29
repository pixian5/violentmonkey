import { getScriptName, i18n, sendCmdDirectly } from '@/common';

/*
 * TXT 导入/导出逻辑。原本写在 `options/views/tab-settings/vm-import.vue` 与
 * `vm-export.vue` 里，抽到这里后两个 Vue 文件只保留 UI 与少量流程编排，
 * 上游更新时这两个文件的 diff 只剩按钮与调用。
 */

/** @return {Promise} 带超时的 Promise，超时使用给定 label */
export function withTimeout(promise, timeout, label) {
  let timer;
  const err = new Error(label || 'Timeout');
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(err), timeout);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

const isPlainObject = val => val && typeof val === 'object' && !Array.isArray(val);

/** @return {?Object} 是 TXT 备份时返回解析结果，否则 null */
export function parseTextBackup(code) {
  try {
    const data = JSON.parse(code);
    return data?.format === 'violentmonkey-text-backup'
      && Array.isArray(data.scripts)
      && data
      || null;
  } catch (e) {
    return null;
  }
}

/**
 * 导入一个 .txt/.js 文件：可能是单个脚本，也可能是 TXT 备份。
 * @param {File} file
 * @param {Object} deps 由 Vue 组件注入的 UI 与流程依赖
 * @param {(text: string, name?: string, type?: string) => void} deps.report
 * @param {(text: string) => void} deps.reportDebug
 * @param {Function} deps.parseScriptForImport
 * @param {() => Promise<void>} deps.refreshAfterImport
 * @param {Object} deps.options 选项存储
 */
export async function importTextScriptFile(file, deps) {
  const { report, reportDebug, parseScriptForImport, refreshAfterImport } = deps;
  if (!file) return;
  reportDebug('开始导入 TXT');
  try {
    const code = await withTimeout(file.text(), 15000, '读取 TXT 超时');
    if (!code?.trim()) {
      throw new Error('TXT 文件为空');
    }
    const backup = parseTextBackup(code);
    if (backup) {
      await importTextBackup(backup, file.name || 'imported.txt', deps);
      return;
    }
    const result = await withTimeout(
      parseScriptForImport({ isNew: true }, code, file.name || 'imported.txt'),
      120000,
      `TXT 导入超时: ${file.name || 'imported.txt'}`
    );
    report('', file.name, 'info');
    report(i18n('msgInstalled'), result?.update?.meta?.name || file.name, 'info');
    await refreshAfterImport();
    reportDebug('TXT 导入完成');
  } catch (e) {
    report(e, file?.name, 'critical');
  }
}

/**
 * 导入 TXT 备份。
 * @param {Object} backup `parseTextBackup` 的结果
 * @param {string} fileName 用于报告显示
 * @param {Object} deps 同 `importTextScriptFile`
 */
export async function importTextBackup(backup, fileName, deps) {
  const { report, reportDebug, parseScriptForImport, sendValues, refreshAfterImport, options } = deps;
  reportDebug('识别为 TXT 备份');
  const scripts = backup.scripts || [];
  const importSettings = options.get('importSettings') && backup.settings;
  const importScriptData = options.get('importScriptData');
  for (const item of scripts) {
    const result = await withTimeout(
      parseScriptForImport({
        custom: item.custom,
        config: item.config,
        position: item.position,
        props: item.props,
      }, item.code, `${item.name || 'script'}.txt`),
      120000,
      `TXT 备份导入超时: ${item.name || 'script'}`
    );
    report(i18n('msgInstalled'), result?.update?.meta?.name || item.name, 'info');
    if (importScriptData && item.values && result?.update?.props?.uri && sendValues) {
      await sendValues({
        [result.update.props.uri]: item.values,
      });
    }
  }
  if (importSettings && isPlainObject(importSettings)) {
    delete importSettings.sync;
    await withTimeout(
      sendCmdDirectly('SetOptions', importSettings, { retry: true, bgTimeout: 1200 }),
      15000,
      'SetOptions 超时'
    );
  }
  try {
    await withTimeout(
      sendCmdDirectly('RebuildScriptIndex', null, { retry: true, bgTimeout: 1200 }),
      20000,
      'RebuildScriptIndex 超时'
    );
  } catch (e) {
    await withTimeout(
      sendCmdDirectly('CheckPosition', null, { retry: true, bgTimeout: 1200 }),
      15000,
      'CheckPosition 超时'
    );
  }
  report('', fileName, 'info');
  await refreshAfterImport();
  reportDebug('TXT 备份导入完成');
}

/**
 * 组装 TXT 备份对象。
 * @param {Object} opts
 * @param {{items: Array, values?: Object}} opts.data `ExportZip` 的结果
 * @param {boolean} opts.withValues 是否导出脚本数据
 * @param {Object} opts.settings 需要一起备份的设置（由调用方从选项存储读取）
 * @param {(name: string) => string} opts.normalizeFilename 文件名规整（与 zip 导出一致）
 * @return {Object} 备份对象
 */
export function buildTextBackup({ data, withValues, settings, normalizeFilename }) {
  const names = {};
  const backup = {
    format: 'violentmonkey-text-backup',
    version: 1,
    settings,
    scripts: [],
  };
  // 同步凭据不进入备份文件
  if (backup.settings) delete backup.settings.sync;
  (data?.items || []).forEach(({ script, code }) => {
    let name = normalizeFilename(getScriptName(script));
    if (names[name]) {
      names[name] += 1;
      name = `${name}_${names[name]}`;
    } else names[name] = 1;
    const { lastModified, lastUpdated } = script.props;
    backup.scripts.push({
      name,
      code,
      custom: script.custom,
      config: script.config,
      position: script.props.position,
      props: {
        lastModified,
        lastUpdated,
        uri: script.props.uri,
      },
      values: withValues ? data.values[script.props.id] : undefined,
    });
  });
  return backup;
}

/** @return {Promise<Blob>} TXT 备份文件内容 */
export async function exportTextBackup(opts) {
  return new Blob([JSON.stringify(buildTextBackup(opts), null, 2)], { type: 'text/plain;charset=utf-8' });
}
