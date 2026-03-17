import {
  formatByteLength,
  getLocaleString,
  getScriptUpdateUrl,
  trueJoin,
} from '@/common';
import { SCRIPTS } from '@/common/safe-globals-shared';
import { loadScriptIcon } from '@/common/load-script-icon';
import {
  formatSizesStr,
  kDescription,
  kName,
  kStorageSize,
  SIZE_TITLES,
  store,
} from './index';

const EMPTY_SIZES = [0, 0, 0, 0, 0];

/**
 * @param {VMScript} script
 * @param {number[]} sizes
 * @param {string} [code]
 */
export function initScript(script, sizes, code) {
  const $cache = script.$cache || (script.$cache = {});
  const meta = script.meta || {};
  const { custom } = script;
  const localeName = getLocaleString(meta, kName);
  const desc = [
    meta[kName],
    localeName,
    meta[kDescription],
    getLocaleString(meta, kDescription),
    custom[kName],
    custom[kDescription],
  ]::trueJoin('\n');
  const name = custom[kName] || localeName;
  let total = 0;
  let str = '';
  (sizes?.length ? sizes : EMPTY_SIZES).forEach((val, i) => {
    total += val;
    if (val) str += `${SIZE_TITLES[i]}: ${formatByteLength(val)}\n`;
  });
  $cache.desc = desc;
  $cache.name = name;
  $cache.lowerName = name.toLocaleLowerCase();
  $cache.tags = custom.tags || '';
  $cache.size = formatByteLength(total, true).replace(' ', '');
  $cache.sizes = formatSizesStr(str);
  $cache.sizeNum = total;
  $cache.sizesNum = sizes;
  $cache[kStorageSize] = (sizes?.length ? sizes : EMPTY_SIZES)[2];
  if (code) $cache.code = code;
  script.$canUpdate = getScriptUpdateUrl(script)
    && (script.config.shouldUpdate ? 1 : -1 /* manual */);
  loadScriptIcon(script, store, true);
}

/**
 * Apply scripts data from background to store.
 * @param {Object} data
 * @param {number} [loadedId]
 * @return {{ scripts: VMScript[], removedScripts: VMScript[] }}
 */
export function applyScriptsData(data, loadedId) {
  const { [SCRIPTS]: allScripts = [], sizes = [], ...auxData } = data || {};
  Object.assign(store, auxData); // initScript needs `cache` in store
  const scripts = [];
  const removedScripts = [];
  allScripts.forEach((script, i) => {
    initScript(script, sizes[i]);
    (script.config.removed ? removedScripts : scripts).push(script);
  });
  store.scripts = scripts;
  store.removedScripts = removedScripts;
  if (store.loaded !== 'all') store.loaded = loadedId ? !!loadedId : 'all';
  return { scripts, removedScripts };
}
