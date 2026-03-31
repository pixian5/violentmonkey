// ==UserScript==
// @name         LINUX DO 外链自动继续
// @namespace    https://linux.do/
// @version      0.1.0
// @description  自动点击 LINUX DO 外链确认弹窗中的继续按钮
// @author       you
// @match        https://linux.do/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_TEXT_RE = /^(继续|继续访问|前往|仍要继续|继续前往)$/;
  const DIALOG_TEXT_RE = /(外部链接|即将离开|继续访问|前往该网址|离开本站)/;

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getButtonText(button) {
    return (button.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function shouldClickButton(button) {
    if (!(button instanceof HTMLButtonElement)) return false;
    if (button.disabled || !isVisible(button)) return false;
    if (!BUTTON_TEXT_RE.test(getButtonText(button))) return false;

    const dialog = button.closest('[role="dialog"], .dialog-holder, .modal, .fk-d-menu');
    const scopeText = dialog ? dialog.textContent || '' : document.body.textContent || '';
    return DIALOG_TEXT_RE.test(scopeText);
  }

  function clickContinueButton() {
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      if (shouldClickButton(button)) {
        button.click();
        return true;
      }
    }
    return false;
  }

  function startObserver() {
    if (!document.body) return;
    const observer = new MutationObserver(() => {
      clickContinueButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  clickContinueButton();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
})();
