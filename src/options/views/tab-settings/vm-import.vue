<template>
  <div>
    <button v-text="i18n('buttonImportData')" @click="pickBackup" ref="buttonImport"
            :disabled="store.batch"/>
    <button v-text="i18n('buttonUndo') + undoTime" @click="undoImport" class="has-error"
            :title="i18nConfirmUndoImport"
            v-if="undoTime" />
    <div v-if="showDebug" class="import-debug" v-text="debugLabel" />
    <div class="mt-1">
      <setting-check name="importScriptData" :label="labelImportScriptData" />
      <br>
      <setting-check name="importSettings" :label="labelImportSettings" />
    </div>
    <table class="import-report">
      <tr v-for="({ type, name, text }, i) in reports" :key="i" :data-type="type">
        <td v-text="name" v-if="name"/>
        <td v-text="text" :colspan="name ? null : 2"/>
      </tr>
    </table>
  </div>
</template>

<script>
import { ensureArray, getUniqId, i18n, sendCmdDirectly } from '@/common';
import { listenOnce } from '@/common/browser';
import { RUN_AT_RE } from '@/common/consts';
import options from '@/common/options';
import loadZipLibrary from '@/common/zip';
import { showConfirmation } from '@/common/ui';
import {
  kDownloadURL, kExclude, kInclude, kMatch, kOrigExclude, kOrigInclude, kOrigMatch,
  runInBatch, store,
} from '../../utils';
</script>

<script setup>
import { onActivated, onMounted, reactive, ref } from 'vue';
import SettingCheck from '@/common/ui/setting-check';

const reports = reactive([]);
const buttonImport = ref();
const undoTime = ref('');
const showDebug = true;
const debugLabel = `导入调试: TARGET=${process.env.TARGET || 'unknown'} `
  + `VM_VER=${process.env.VM_VER || 'n/a'} `
  + `时间=${new Date().toLocaleTimeString()}`;
const i18nConfirmUndoImport = i18n('confirmUndoImport');
const labelImportScriptData = i18n('labelImportScriptData');
const labelImportSettings = i18n('labelImportSettings');

let depsPortId;
let undoPort;

onMounted(() => {
  const toggleDragDrop = initDragDrop(buttonImport.value);
  addEventListener('hashchange', toggleDragDrop);
  toggleDragDrop();
  reportDebug(`导入调试已启用 TARGET=${process.env.TARGET || 'unknown'} VM_VER=${process.env.VM_VER || 'n/a'}`);
  console.info('[vm-import] 导入调试已启用', {
    target: process.env.TARGET,
    vmVer: process.env.VM_VER,
  });
});
onActivated(() => {
  if (++store.isEmpty === 2) {
    const btn = buttonImport.value;
    if (btn.getBoundingClientRect().y > innerHeight / 2) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => btn.focus());
  }
});

function pickBackup() {
  reports.length = 0;
  reportDebug('点击导入按钮');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.style.position = 'fixed';
  input.style.left = '-1000px';
  input.style.top = '0';
  input.style.opacity = '0';
  input.style.width = '1px';
  input.style.height = '1px';
  let picked = false;
  let waitingTimer;
  const onFocus = () => {
    if (!picked) reportDebug('可能未选择文件');
    cleanup();
  };
  const cleanup = () => {
    clearTimeout(waitingTimer);
    removeEventListener('focus', onFocus, true);
  };
  input.onchange = () => {
    picked = true;
    const file = input.files?.[0];
    reportDebug(file ? `选择文件: ${file.name} (${file.size} bytes)` : '未选择文件');
    cleanup();
    importBackup(file);
    input.remove();
  };
  input.addEventListener?.('cancel', () => {
    reportDebug('文件选择已取消');
    cleanup();
  });
  document.body.append(input);
  reportDebug('触发文件选择');
  input.click();
  waitingTimer = setTimeout(() => reportDebug('等待选择文件...'), 400);
  addEventListener('focus', onFocus, true);
}

async function importBackup(file) {
  if (store.batch) {
    reportDebug('导入被批处理锁定');
    return;
  }
  runInBatch(doImportBackup, file);
}

async function doImportBackup(file) {
  if (!file) return;
  reports.length = 0;
  reportDebug('开始导入');
  const importScriptData = options.get('importScriptData');
  let zip;
  try {
    zip = await withTimeout(loadZipLibrary(), 8000, '加载ZIP库超时');
    if (!zip?.ZipReader || !zip?.BlobReader) {
      throw new Error('ZIP库未就绪');
    }
    reportDebug('ZIP库已就绪');
  } catch (e) {
    report(e, file.name, 'critical');
    return;
  }
  let reader;
  let entries;
  const zipProgressIndex = (() => {
    reportDebug('读取ZIP条目...');
    return reports.length - 1;
  })();
  const updateZipProgress = (progress, total, label = '读取ZIP') => {
    const row = reports[zipProgressIndex];
    if (!row) return;
    if (Number.isFinite(total) && total > 0) {
      row.text = `${label}: ${progress} / ${total}`;
    } else {
      row.text = `${label}: ${progress}`;
    }
  };
  const readEntriesWithReader = async (makeReader, label) => {
    try {
      reader = makeReader();
    } catch (e) {
      report(e, file.name, 'critical');
      return null;
    }
    try {
      updateZipProgress(0, 0, label);
      return await withTimeout(reader.getEntries({
        onprogress: (progress, total) => updateZipProgress(progress, total, label),
      }), 20000, '读取ZIP超时');
    } catch (e) {
      report(e, file.name, 'critical');
      await reader.close().catch(() => {});
      return null;
    }
  };
  entries = await readEntriesWithReader(
    () => new zip.ZipReader(new zip.BlobReader(file), { useWebWorkers: false }),
    '读取ZIP(Blob)'
  );
  if (!entries) {
    reportDebug('Blob读取失败，尝试Uint8Array读取');
    let buf;
    try {
      buf = await withTimeout(file.arrayBuffer(), 20000, '读取文件超时');
    } catch (e) {
      report(e, file.name, 'critical');
      return;
    }
    entries = await readEntriesWithReader(
      () => new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(buf)), { useWebWorkers: false }),
      '读取ZIP(Uint8Array)'
    );
  }
  if (!entries) return;
  reportDebug('ZIP条目读取完成');
  if (reports.some(item => item.type === 'critical')) return;
  reportDebug(`读取条目数: ${entries.length}`);
  report('', file.name, 'info');
  report('', '', 'info'); // deps
  const uriMap = {};
  const total = entries.reduce((n, entry) => n + entry.filename?.endsWith('.user.js'), 0);
  const vmEntry = entries.find(entry => entry.filename?.toLowerCase() === 'violentmonkey');
  const vm = vmEntry && await readContents(vmEntry) || {};
  const importSettings = options.get('importSettings') && vm.settings;
  const scripts = vm.scripts || {};
  const values = vm.values || {};
  let now;
  let depsDone = 0;
  let depsTotal = 0;
  depsPortId = getUniqId();
  browser.runtime.onConnect.addListener(port => {
    if (port.name !== depsPortId) return;
    port.onMessage.addListener(([url, done]) => {
      if (done) ++depsDone; else ++depsTotal;
      reports[1].name = i18n('msgLoadingDependency', [depsDone, depsTotal]);
      if (depsDone === depsTotal) {
        url = i18n('buttonOK');
        port.disconnect();
      } else if (!done) {
        url += '...';
      }
      reports[1].text = url;
    });
  });
  if (!undoPort) {
    now = ' ⯈ ' + new Date().toLocaleTimeString();
    undoPort = browser.runtime.connect({ name: 'undoImport' });
    const ready = await waitPortReady(undoPort);
    if (!ready) undoPort = null;
    reportDebug(`undo端口: ${ready ? '就绪' : '超时'}`);
  }
  reportDebug('处理 .options.json');
  await processAll(readScriptOptions, '.options.json');
  reportDebug('处理 .user.js');
  await processAll(readScript, '.user.js');
  if (importScriptData) {
    reportDebug('处理 .storage.json');
    await processAll(readScriptStorage, '.storage.json');
    await withTimeout(
      sendCmdDirectly('SetValueStores', values, { retry: true, bgTimeout: 1200 }),
      15000,
      'SetValueStores 超时'
    );
  }
  if (isObject(importSettings)) {
    delete importSettings.sync;
    await withTimeout(
      sendCmdDirectly('SetOptions', importSettings, { retry: true, bgTimeout: 1200 }),
      15000,
      'SetOptions 超时'
    );
  }
  await withTimeout(
    sendCmdDirectly('CheckPosition', null, { retry: true, bgTimeout: 1200 }),
    15000,
    'CheckPosition 超时'
  );
  await reader.close();
  reportProgress();
  if (now && undoPort) undoTime.value = now;
  reportDebug('导入完成');

  function parseJson(text, entry) {
    try {
      return JSON.parse(text);
    } catch (e) {
      report(e, entry.filename, null);
    }
  }
  async function processAll(transform, suffix) {
    for (const entry of entries) {
      const { filename } = entry;
      if (filename?.endsWith(suffix)) {
        const contents = await readContents(entry);
        if (contents) {
          await transform(entry, contents, filename.slice(0, -suffix.length));
        }
      }
    }
  }
  async function readContents(entry) {
    const text = await withTimeout(
      entry.getData(new zip.TextWriter()),
      15000,
      `读取条目超时: ${entry.filename}`
    );
    return entry.filename.endsWith('.js') ? text : parseJson(text, entry);
  }
  async function readScript(entry, code, name) {
    const { filename } = entry;
    const more = scripts[name];
    const data = {
      code,
      portId: depsPortId,
      ...more && {
        custom: more.custom,
        config: {
          enabled: more.enabled ?? 1, // Import data from older version
          shouldUpdate: more.update ?? 1, // Import data from older version
          ...more.config,
        },
        position: more.position,
        props: {
          lastModified: more.lastModified
            || more.props?.lastModified // Import data from Tampermonkey
            || +entry.lastModDate,
          lastUpdated: more.lastUpdated
            || more.props?.lastUpdated // Import data from Tampermonkey
            || +entry.lastModDate,
        },
      },
    };
    const codeKey = `import:code:${getUniqId()}`;
    try {
      reportDebug(`ParseScript: ${filename}`);
      await withTimeout(
        browser.storage.local.set({ [codeKey]: code }),
        15000,
        `保存脚本超时: ${filename}`
      );
      const payload = { ...data, codeKey };
      delete payload.code;
      const result = await withTimeout(
        sendCmdDirectly('ParseScriptFromStorage', payload, { retry: true, bgTimeout: 1200 }),
        60000,
        `ParseScript 超时: ${filename}`
      );
      uriMap[name] = result.update.props.uri;
      reportProgress(filename);
    } catch (e) {
      report(e, filename, 'script');
      await browser.storage.local.remove(codeKey).catch(() => {});
    }
  }
  async function readScriptOptions(entry, json, name) {
    const { meta, settings = {}, options: opts } = json;
    if (!meta || !opts) return;
    const ovr = opts.override || {};
    reports[0].text = 'Tampermonkey';
    /** @type {VMScript} */
    scripts[name] = {
      config: {
        enabled: settings.enabled !== false ? 1 : 0,
        shouldUpdate: opts.check_for_updates ? 1 : 0,
      },
      custom: {
        [kDownloadURL]: typeof meta.file_url === 'string' ? meta.file_url : undefined,
        noframes: ovr.noframes == null ? undefined : +!!ovr.noframes,
        runAt: RUN_AT_RE.test(opts.run_at) ? opts.run_at : undefined,
        [kExclude]: toStringArray(ovr.use_excludes),
        [kInclude]: toStringArray(ovr.use_includes),
        [kMatch]: toStringArray(ovr.use_matches),
        [kOrigExclude]: ovr.merge_excludes !== false, // will also set to true if absent
        [kOrigInclude]: ovr.merge_includes !== false,
        [kOrigMatch]: ovr.merge_matches !== false,
      },
      position: +settings.position || undefined,
      props: {
        lastModified: +meta.modified,
        lastUpdated: +meta.modified,
      },
    };
  }
  async function readScriptStorage(entry, json, name) {
    reports[0].text = 'Tampermonkey';
    values[uriMap[name]] = json.data;
  }
  function reportProgress(filename = '') {
    const count = Object.keys(uriMap).length;
    const text = i18n('msgImported', [count === total ? count : `${count} / ${total}`]);
    reports[0].name = text; // keeping the message in the first column so it doesn't jump around
    reports[0].text = filename;
    return text;
  }
  function toStringArray(data) {
    return ensureArray(data).filter(item => typeof item === 'string');
  }
}

async function undoImport() {
  if (!undoPort) return;
  if (!await showConfirmation(i18nConfirmUndoImport)) return;
  undoTime.value = '';
  undoPort.postMessage(true);
  await new Promise(resolveOnUndoMessage);
}

function resolveOnUndoMessage(resolve) {
  undoPort.onMessage::listenOnce(resolve);
}

function waitPortReady(port, timeout = 1500) {
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

function withTimeout(promise, timeout, label) {
  let timer;
  const err = new Error(label || 'Timeout');
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(err), timeout);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function report(text, name, type = 'critical') {
  const message = text && (text.message || text.code) ? (text.message || text.code) : `${text}`;
  reports.push({ text: message, name, type });
}

function reportDebug(text) {
  report(text, '', 'debug');
}

function initDragDrop(targetElement) {
  let leaveTimer;
  const showAllowedState = state => targetElement.classList.toggle('drop-allowed', state);
  const onDragEnd = () => showAllowedState(false);
  const onDragLeave = () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(onDragEnd, 250);
  };
  const onDragOver = evt => {
    clearTimeout(leaveTimer);
    const hasFiles = evt.dataTransfer.types.includes('Files');
    if (hasFiles) evt.preventDefault();
    showAllowedState(hasFiles);
  };
  const onDrop = async evt => {
    evt.preventDefault();
    showAllowedState(false);
    // storing it now because `files` will be null after await
    const file = evt.dataTransfer.files[0];
    if (!await showConfirmation(i18n('buttonImportData'))) return;
    await importBackup(file);
  };
  return () => {
    const isSettingsTab = store.route.hash === TAB_SETTINGS;
    const onOff = isSettingsTab ? addEventListener : removeEventListener;
    onOff('dragend', onDragEnd);
    onOff('dragleave', onDragLeave);
    onOff('dragover', onDragOver);
    onOff('drop', onDrop);
  };
}
</script>

<style>
button.drop-allowed {
  background-color: green;
  color: white;
  animation: outline-zoom-in .25s cubic-bezier(0, .5, 0, .75);
}
@keyframes outline-zoom-in {
  from {
    outline: 20px solid rgba(0, 128, 0);
    outline-offset: 200px;
  }
  to {
    outline: 1px solid rgba(0, 128, 0, 0);
    outline-offset: 0;
  }
}
.import-report {
  white-space: pre-wrap;
  padding-top: 1rem;
  font-size: 90%;
  color: #c80;
  &:empty {
    display: none;
  }
  td {
    padding: 1px .5em 3px;
    vertical-align: top; // in case of super long multiline text
  }
  [data-type="critical"] {
    color: #fff;
    background-color: red;
    font-weight: bold;
  }
  [data-type="script"] {
    color: red;
  }
  [data-type="info"] {
    color: blue;
  }
  [data-type="debug"] {
    color: #777;
  }
  @media (prefers-color-scheme: dark) {
    color: #a83;
    [data-type="info"] {
      color: #fff;
    }
    [data-type="debug"] {
      color: #bbb;
    }
  }
}
.import-debug {
  color: #888;
  font-size: 12px;
  margin-top: 6px;
}
</style>
