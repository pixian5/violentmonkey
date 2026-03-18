// ==UserScript==
// @name         Puresys 移除置顶
// @namespace    https://www.puresys.net/
// @version      0.1.0
// @description  移除 Puresys 列表中的置顶项
// @author       you
// @match        https://www.puresys.net/*
// @match        https://puresys.net/*
// @match        http://www.puresys.net/*
// @match        http://puresys.net/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STICKY_ARTICLE_SELECTOR = 'article.excerpt-sticky';
  const STICKY_ICON_SELECTOR = '.sticky-icon';

  function removeStickyArticles() {
    document.querySelectorAll(STICKY_ARTICLE_SELECTOR).forEach((article) => {
      article.remove();
    });

    document.querySelectorAll(STICKY_ICON_SELECTOR).forEach((icon) => {
      const article = icon.closest('article');
      if (article) article.remove();
    });
  }

  const observer = new MutationObserver(() => {
    removeStickyArticles();
  });

  const startObserve = () => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      removeStickyArticles();
      startObserve();
    });
  } else {
    removeStickyArticles();
    startObserve();
  }
})();
