import '@/common/browser';
import { makePause, sendCmdDirectly } from '@/common';
import handlers from '@/common/handlers';
import options from '@/common/options';
import { render } from '@/common/ui';
import '@/common/ui/favicon';
import '@/common/ui/style';
import {
  performSearch, store, updateTags,
} from './utils';
import { applyScriptsData, initScript } from './utils/scripts-data';
import App from './views/app';

let updateThrottle;

initMain();
render(App);

export function loadData() {
  const id = +store.route.paths[1];
  return requestData(id)
  .catch(id && (() => requestData()));
  /* Catching in order to retry without an id if the id is invalid.
   * Errors will be shown in showUnhandledError. */
}

async function requestData(id) {
  const [data] = await Promise.all([
    sendCmdDirectly('GetData', { id, sizes: true }, { retry: true }),
    options.ready,
  ]);
  applyScriptsData(data, id);
}

function initMain() {
  loadData();
  Object.assign(handlers, {
    ScriptsUpdated() {
      loadData();
    },
    UpdateSync(data) {
      store.sync = data;
    },
    async UpdateScript({ update, where, code } = {}) {
      if (!update) return;
      if (!where?.id) return;
      if (updateThrottle
      || (updateThrottle = store.batch)
      && (updateThrottle = Promise.race([updateThrottle, makePause(500)]))) {
        await updateThrottle;
        updateThrottle = null;
      }
      const i1 = store.scripts.findIndex(item => item.props.id === where.id);
      const i2 = store.removedScripts.findIndex(item => item.props.id === where.id);
      // JS engines like V8 deoptimize when accessing an array element out of bounds
      const oldScript = i1 >= 0 ? store.scripts[i1] : i2 >= 0 ? store.removedScripts[i2] : null;
      const script = oldScript
        || update.meta && store.canRenderScripts && {}; // a new script was just saved or installed
      if (!script) return; // We're in editor that doesn't have data for all scripts
      const removed = update.config?.removed;
      const oldTags = oldScript?.custom.tags;
      let sizes;
      try {
        [sizes] = await sendCmdDirectly('GetSizes', [where.id]);
      } catch (e) {
        sizes = null;
      }
      const { search } = store;
      Object.assign(script, update);
      if (script.error && !update.error) script.error = null;
      initScript(script, sizes, code);
      if (search) performSearch([script], search.rules);
      if (removed != null) {
        if (removed) {
          // Note that we don't update store.scripts even if a script is removed,
          // because we want to keep the removed script there to allow the user
          // to undo an accidental removal.
          // We will update store.scripts when the installed list is rerendered.
          store.needRefresh = true;
        } else {
          // Restored from the recycle bin.
          store.removedScripts = store.removedScripts.filter(rs => rs.props.id !== where.id);
        }
      }
      // Update the new list
      const i = script.config.removed ? i2 : i1;
      if (i < 0) {
        script.message = '';
        const list = script.config.removed ? 'removedScripts' : 'scripts';
        store[list] = [...store[list], script];
      }
      if (store.tags && (
        removed != null ||
        (oldTags || '') !== (script.custom.tags || '')
      )) updateTags();
    },
    RemoveScripts(ids) {
      store.removedScripts = store.removedScripts.filter(script => !ids.includes(script.props.id));
    },
  });
}
