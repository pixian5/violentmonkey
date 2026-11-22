import browser from '@/common/browser';
import { i18n } from '@/common';
import { readForkLogs } from './log';

/*
 * Safari 上弹窗内嵌设置面板不可用：把“设置”入口改到扩展设置页。
 * 用捕获阶段监听拦截点击，避免改动上游 `popup/views/app.vue`。
 *
 * 另外提供一条排查通道：把后台写入 localStorage 的 fork 诊断日志显示在弹窗底部。
 * Safari 的后台页没有可直接打开的 devtools，后台若在求值阶段崩溃，
 * 唯一能留下的证据就是这段日志。
 */

/** @return {boolean} 是否是弹窗菜单里的“设置”项 */
const isSettingsItem = el => el?.tagName === 'DIV'
  && el.textContent?.trim() === i18n('popupSettings')
  && !!el.closest('.extras-menu, .menu');

const isCogButton = el => {
  const area = el?.closest?.('.menu-area');
  return !!area && (area.dataset?.message || '').includes(i18n('popupSettingsHint'));
};

export function installPopupSettingsRoute() {
  const openSettings = () => {
    const url = browser.runtime.getURL('/options/index.html#settings');
    const done = browser.tabs.create({ url }).catch(() => window.open(url, '_blank'));
    done.then(close, close);
  };
  document.addEventListener('click', evt => {
    if (isSettingsItem(evt.target)) {
      evt.preventDefault();
      evt.stopPropagation();
      openSettings();
    }
  }, true);
  document.addEventListener('contextmenu', evt => {
    if (isCogButton(evt.target)) {
      evt.preventDefault();
      evt.stopPropagation();
      openSettings();
    }
  }, true);
}

/*
 * 只有真正的故障才展示到 UI 上。
 *
 * 后台里有些“预期内”的告警是 Safari 的固有差异（例如 `tabs.executeScript`
 * 等原生成员只读、`permissions.contains('downloads')` 被拒），它们已被降级处理、
 * 不影响功能，若也展示出来只会让每个弹窗都拖着一块红字，反而干扰使用。
 */
const ALERT_RE = /未捕获异常|未处理的 Promise 异常|init 失败|仍未完成|补丁失败|命令 \S+ (失败|同步抛错)/;

export function installForkLogViewer() {
  const show = () => {
    const logs = readForkLogs();
    if (!logs.some(line => ALERT_RE.test(line))) return;
    const el = document.createElement('pre');
    el.id = 'forkLogs';
    el.textContent = `[fork 诊断日志]\n${logs.join('\n')}`;
    el.style.cssText = [
      'position:fixed',
      'z-index:1000000',
      'left:0',
      'right:0',
      'bottom:0',
      'max-height:60%',
      'overflow:auto',
      'margin:0',
      'padding:4px',
      'background:#000c',
      'color:#ff6b6b',
      'font:9px/1.25 ui-monospace,monospace',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';');
    document.body.append(el);
  };
  // 等上游 UI 先渲染完，再追加诊断块
  setTimeout(show, 300);
}
