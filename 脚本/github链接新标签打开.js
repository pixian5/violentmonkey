// ==UserScript==
// @name         GitHub 链接在新标签页打开
// @namespace    https://github.com/pixian5
// @version      1.0.0
// @description  在 github.com 及 *.github.com 任意页面点击链接时，强制在新标签页打开；锚点、中键/Cmd(Ctrl)+点击、已有 target=_blank 的链接保持原行为；兼容 GitHub SPA 动态加载
// @author       pixian5
// @match        *://github.com/*
// @match        *://*.github.com/*
// @icon         https://github.com/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ===== 配置 =====
    // 调试日志开关：true 时在控制台打印每次拦截的链接，便于排查误触
    const DEBUG = true;
    // 允许新标签打开时携带的 cookie/session：noopener 不带原页面引用，noreferrer 不发 Referer
    const WINDOW_OPEN_FEATURES = 'noopener,noreferrer';

    /**
     * 判断本次点击是否需要被脚本接管
     * 只处理真正的 <a href>，排除锚点、伪协议、按钮型 a 标签
     */
    function shouldIntercept(anchor) {
        if (!anchor) return false;
        if (anchor.tagName !== 'A') return false;

        // 没有 href 属性的 a 标签（如样式锚点、占位）不处理
        const rawHref = anchor.getAttribute('href');
        if (rawHref === null || rawHref === '') return false;

        // 页面内锚点（#xxx）保持原行为，不新开标签
        if (rawHref.startsWith('#')) return false;

        // 伪协议不处理：javascript: / mailto: / tel: / blob: / data:
        if (/^\s*(javascript|mailto|tel|blob|data):/i.test(rawHref)) return false;

        // 用户已经显式指定 target（_blank / _parent / _top 等），尊重原设置
        if (anchor.target && anchor.target !== '_self' && anchor.target !== '') return false;

        return true;
    }

    /**
     * 点击事件处理（捕获阶段，抢在 GitHub SPA 路由之前）
     */
    document.addEventListener('click', function (event) {
        // 只接管左键单击（button===0）
        // 右键（menu）、中键（auxclick）、带修饰键（Cmd/Ctrl/Shift/Alt）的点击全部交给浏览器默认行为
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        // 用户按下了拖拽选择等，不拦截
        if (event.defaultPrevented) return;

        // 从事件源向上找最近的 a[href]
        const anchor = event.target && typeof event.target.closest === 'function'
            ? event.target.closest('a[href]')
            : null;

        if (!shouldIntercept(anchor)) return;

        // 用 .href 拿到浏览器解析后的绝对地址（兼容相对路径）
        const targetUrl = anchor.href;
        if (!targetUrl) return;

        if (DEBUG) {
            console.log('[GitHub新标签] 拦截链接:', targetUrl, '| 锚点文本:', anchor.textContent.trim().slice(0, 40));
        }

        // 阻止 GitHub SPA 的 pushState 跳转与浏览器默认导航
        event.preventDefault();
        event.stopPropagation();

        // 在新标签页打开
        const win = window.open(targetUrl, '_blank', WINDOW_OPEN_FEATURES);

        // 极少数情况被弹窗拦截器挡住时，回退成 _self 导航，避免点击完全无响应
        if (!win && DEBUG) {
            console.warn('[GitHub新标签] window.open 被拦截，回退到当前标签跳转:', targetUrl);
            window.location.href = targetUrl;
        }
    }, /* useCapture = */ true);

    if (DEBUG) {
        console.log('[GitHub新标签] 脚本已加载，监听范围: github.com / *.github.com');
    }
})();
