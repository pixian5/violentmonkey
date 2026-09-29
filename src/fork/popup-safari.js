import browser from '@/common/browser';
import { i18n } from '@/common';

/*
 * Safari 上弹窗内嵌设置面板不可用：把“设置”入口改到扩展设置页。
 * 用捕获阶段监听拦截点击，避免改动上游 `popup/views/app.vue`。
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
