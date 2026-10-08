<template>
  <div>
    <button v-text="buttonImportScriptFile" @click="pickTextScript" :disabled="store.batch" />
    <br>
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

<script setup>
import { strFromU8, unzipSync } from 'fflate';
import { ensureArray, getUniqId, i18n, readBlob, sendCmdDirectly } from '@/common';
import browser, { listenOnce } from '@/common/browser';
import { kOrigTag, kTag, RUN_AT_RE } from '@/common/consts';
import options from '@/common/options';
import { showConfirmation } from '@/common/ui';
import {
  kComment, kDownloadURL, kExclude, kInclude, kMatch, kOrigExclude, kOrigInclude, kOrigMatch, runInBatch, store,
  vmZipEntryName,
} from '../../utils';
// fork: 导入流程的自有增强都在 @/fork/import-flow，这里只做组装与调用
import {
  createImportDeps, createImportReporter, isImportDebugEnabled, isPlainObject,
  getImportDebugLabel, pickFileForImport, rebuildIndexOrCheckPosition,
  refreshAfterImport, sendValueStoresBatched, waitPortReady,
} from '@/fork/import-flow';
import { importTextScriptFile, withTimeout } from '@/fork/txt-transfer';
import { onActivated, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import SettingCheck from '@/common/ui/setting-check';

const reports = reactive([]);
const buttonImport = ref();
const undoTime = ref('');
const i18nConfirmUndoImport = i18n('confirmUndoImport');
const labelImportScriptData = i18n('labelImportScriptData');
const labelImportSettings = i18n('labelImportSettings');
const buttonImportScriptFile = '从文件导入脚本';
const showDebug = isImportDebugEnabled();
const debugLabel = getImportDebugLabel();
const TM = 'Tampermonkey';
const { report, reportDebug } = createImportReporter(reports);
const importDeps = createImportDeps({ reports, store });

let depsPortId;
let removeDepsPortListener;
let undoPort;

onMounted(() => {
  const toggleDragDrop = initDragDrop(buttonImport.value);
  addEventListener('hashchange', toggleDragDrop);
  toggleDragDrop();
});
onBeforeUnmount(() => removeDepsPortListener?.());
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
  pickFileForImport('.zip', importBackup, reportDebug);
}

function pickTextScript() {
  reports.length = 0;
  reportDebug('点击从文件导入脚本按钮');
  pickFileForImport('.txt,.user.js,.js,text/plain,application/javascript', importTextScript, reportDebug);
}

async function importTextScript(file) {
  if (store.batch) {
    reportDebug('导入被批处理锁定');
    return;
  }
  runInBatch(importTextScriptFile, file, importDeps);
}

async function importBackup(file) {
  if (file && !store.batch) {
    runInBatch(doImportBackup, await readBlob(file, true), file.name);
  }
}

async function doImportBackup(buf, zipName) {
  reports.length = 0;
  let vm;
  let files;
  let total = 0;
  const importScriptData = options.get('importScriptData');
  const optionsNames = [];
  const scriptTimes = {};
  const storageNames = [];
  const kUserJs = '.user.js';
  const kOptionsJson = '.options.json';
  const kStorageJson = '.storage.json';
  try {
    files = unzipSync(new Uint8Array(buf), {
      filter: ({ name: filename, time, originalSize }) => originalSize < 100e6 && (
        filename.toLowerCase() === vmZipEntryName && (vm = filename) ||
        filename.endsWith(kOptionsJson) && optionsNames.push(filename) ||
        filename.endsWith(kStorageJson) && storageNames.push(filename) ||
        filename.endsWith(kUserJs) && (scriptTimes[filename] = time, ++total)
      ),
    });
  } catch (err) {
    report(err.message || err);
    return;
  }
  report('', zipName, 'info');
  report('', '', 'info'); // deps
  const uriMap = {};
  let scripts = {};
  let values = {};
  let now;
  let depsDone = 0;
  let depsTotal = 0;
  const portId = depsPortId = getUniqId();
  removeDepsPortListener?.();
  const onConnect = port => {
    if (port.name !== portId) return;
    removeDepsPortListener?.();
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
  };
  browser.runtime.onConnect.addListener(onConnect);
  removeDepsPortListener = () => {
    browser.runtime.onConnect.removeListener(onConnect);
    removeDepsPortListener = null;
  };
  if (!undoPort) {
    now = ' ▶ ' + new Date().toLocaleTimeString();
    undoPort = browser.runtime.connect({ name: 'undoImport' });
    const ready = await waitPortReady(undoPort);
    if (!ready) undoPort = null;
    reportDebug(`undo端口: ${ready ? '就绪' : '超时'}`);
  }
  for (const filename in files) {
    try {
      const text = strFromU8(files[filename]);
      files[filename] = filename.endsWith(kUserJs)
        ? text
        : JSON.parse(text, filename);
    } catch (e) {
      report(e, filename, null);
    }
  }
  if (vm && (vm = files[vm])) {
    scripts = vm.scripts || scripts;
    values = vm.values || values;
    if (options.get('importSettings') && isPlainObject(vm.settings)) {
      delete vm.settings.sync;
      await withTimeout(
        sendCmdDirectly('SetOptions', vm.settings, { retry: true, bgTimeout: 1200 }),
        15000,
        'SetOptions 超时'
      );
    }
  }
  optionsNames.forEach(readScriptOptions);
  for (const filename in scriptTimes) {
    await readScript(filename, scriptTimes[filename]);
  }
  if (importScriptData) {
    storageNames.forEach(readScriptStorage);
    await sendValueStoresBatched(values, reportDebug);
  }
  await rebuildIndexOrCheckPosition(reportDebug);
  await refreshAfterImport({ store, onDebug: reportDebug });
  reportProgress();
  if (now && undoPort) undoTime.value = now;

  async function readScript(filename, time) {
    let decodedTime;
    const name = filename.slice(0, -kUserJs.length);
    const code = files[filename];
    const more = scripts[name];
    const data = {
      code: files[filename],
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
            || (decodedTime = +zipTimeToDate(time) || now),
          lastUpdated: more.lastUpdated
            || more.props?.lastUpdated // Import data from Tampermonkey
            || decodedTime
            || +zipTimeToDate(time)
            || now,
        },
      },
    };
    files[filename] = '';
    try {
      reportDebug(`ParseScript: ${filename}`);
      const result = await importDeps.parseScriptForImport(data, code, filename);
      uriMap[name] = result.update.props.uri;
      reportProgress(filename);
    } catch (e) {
      report(e, filename, 'script');
    }
  }
  function readScriptOptions(filename) {
    const name = filename.slice(0, -kOptionsJson.length);
    const { meta, settings = {}, options: opts } = files[filename];
    files[filename] = '';
    if (!meta || !opts) return;
    const ovr = opts.override || {};
    const tags = opts.tags;
    const origTags = ovr.orig_tags;
    const hasOrigTags = !origTags?.length || tags?.length && origTags.every(t => tags.includes(t));
    reports[0].text = TM;
    /** @type {VMScript} */
    scripts[name] = {
      config: {
        enabled: settings.enabled !== false ? 1 : 0,
        shouldUpdate: opts.check_for_updates ? 1 : 0,
      },
      custom: {
        [kDownloadURL]: typeof meta.file_url === 'string' ? meta.file_url : undefined,
        [kTag]: hasOrigTags && origTags ? tags.filter(t => !origTags.includes(t)) : tags,
        [kOrigTag]: !!hasOrigTags,
        [kComment]: ovr[kComment] || undefined,
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
  function readScriptStorage(filename) {
    const name = filename.slice(0, -kStorageJson.length);
    reports[0].text = TM;
    values[uriMap[name]] = files[filename].data;
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
  function zipTimeToDate(time) {
    return new Date(
      /*Y*/((time >> 25) & 0x7f) + 1980,
      /*M*/((time >> 21) & 0x0f) - 1,
      /*D*/(time >> 16) & 0x1f,
      /*h*/(time >> 11) & 0x1f,
      /*m*/(time >> 5) & 0x3f,
      /*s*/(time & 0x1f) * 2,
    );
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
