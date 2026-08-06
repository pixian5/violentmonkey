// ==UserScript==
// @name         x自动点击第二次【转帖】按钮 + 精准喜欢
// @match        *://x.com/*
// @exclude      *://x.com/i/*
// @version      4.0.1
// @description  自动确认转帖，并精准对该条帖子/评论点喜欢，不误触其他推文
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const VERSION = '4.0.1';
    const RETWEET_CONFIRM_TESTIDS = ['retweetConfirm', 'retweetConfirmLegacy'];
    const RETWEET_CONFIRM_TEXTS = ['转帖', '轉帖', 'Repost', 'Retweet'];
    const RETWEET_BUTTON_SELECTOR = [
        '[data-testid="retweet"]',
        '[aria-label*="转帖"]',
        '[aria-label*="轉帖"]',
        '[aria-label*="Repost"]',
        '[aria-label*="Retweet"]',
    ].join(',');
    const LIKE_BUTTON_SELECTOR = [
        '[data-testid="like"]',
        'button[aria-label*="喜欢"]',
        'button[aria-label*="喜歡"]',
        'button[aria-label*="Like"]',
    ].join(',');

    // 记录用户点击转帖按钮时所在的推文，避免后续误触其他推文
    let pendingTweet = null;
    let retweetConfirmInFlight = false;
    const clickedConfirmButtons = new WeakSet();

    // ── 工具函数 ────────────────────────────────────────────────

    function isElement(node) {
        return node && node.nodeType === Node.ELEMENT_NODE;
    }

    function normalizedText(el) {
        return (el?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function isClickable(element) {
        if (!element) return false;
        const style = getComputedStyle(element);
        return (
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            element.offsetWidth > 0 &&
            element.offsetHeight > 0 &&
            !element.disabled &&
            element.getAttribute('aria-disabled') !== 'true'
        );
    }

    /**
     * 从某元素向上找最近的推文容器。
     * X.com 的推文容器特征：data-testid="tweet" 或 <article>
     */
    function findParentArticle(el) {
        while (el && el !== document.body) {
            if (el.dataset?.testid === 'tweet' || el.tagName?.toLowerCase() === 'article') {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    function getTweetId(articleEl) {
        const statusLink = articleEl?.querySelector('a[href*="/status/"]');
        const match = statusLink?.getAttribute('href')?.match(/\/status\/(\d+)/);
        return match?.[1] || null;
    }

    function rememberTweet(retweetBtn) {
        const article = findParentArticle(retweetBtn);
        if (!article) return;
        pendingTweet = {
            article,
            tweetId: getTweetId(article),
            capturedAt: Date.now(),
        };
        console.log('📌 已记录转帖来源推文:', pendingTweet.tweetId || article);
    }

    function resolvePendingArticle(snapshot = pendingTweet) {
        if (!snapshot) return null;
        if (snapshot.article?.isConnected) return snapshot.article;
        if (!snapshot.tweetId) return null;
        const statusLink = document.querySelector(`article a[href*="/status/${snapshot.tweetId}"]`);
        return findParentArticle(statusLink);
    }

    function isConfirmRetweetButton(el) {
        if (!isElement(el) || !isClickable(el)) return false;

        if (RETWEET_CONFIRM_TESTIDS.includes(el.dataset?.testid)) return true;

        const actionable = el.closest('[role="menuitem"], [role="button"], button, div');
        if (!actionable || actionable !== el) return false;

        const text = normalizedText(el);
        if (!RETWEET_CONFIRM_TEXTS.includes(text)) return false;

        const aria = el.getAttribute('aria-label') || '';
        const testid = el.getAttribute('data-testid') || '';
        return Boolean(
            /retweet|repost/i.test(testid) ||
            /转帖|轉帖|Repost|Retweet/i.test(aria) ||
            el.closest('[role="menu"]') ||
            el.closest('[data-testid="Dropdown"]')
        );
    }

    function findConfirmButton(root) {
        const direct = RETWEET_CONFIRM_TESTIDS
            .map(testid => root.querySelector?.(`[data-testid="${testid}"]`))
            .find(Boolean);
        if (direct && isClickable(direct)) return direct;

        const candidates = root.querySelectorAll?.('[role="menuitem"], [role="button"], button, div') || [];
        return Array.from(candidates).find(isConfirmRetweetButton) || null;
    }

    /**
     * 在指定推文容器内点喜欢（仅未点赞状态）。
     */
    function likeTweet(articleEl) {
        if (!articleEl) {
            console.warn('⚠️ 无目标推文，跳过喜欢');
            return;
        }

        if (articleEl.querySelector('[data-testid="unlike"]')) {
            console.log('ℹ️ 已喜欢过，跳过');
            return;
        }

        const likeBtn = articleEl.querySelector(LIKE_BUTTON_SELECTOR);
        if (likeBtn && isClickable(likeBtn)) {
            likeBtn.click();
            console.log('✅ 精准喜欢成功', articleEl);
        } else {
            console.warn('⚠️ 未找到可点击的喜欢按钮');
        }
    }

    // ── 第一步：捕获阶段监听用户点击转帖按钮 ───────────────────
    // 时机：用户点击第一次转帖按钮（弹出菜单前），此时元素还在 article 内
    document.addEventListener('click', function(e) {
        const retweetBtn = e.target.closest?.(RETWEET_BUTTON_SELECTOR);
        if (!retweetBtn || retweetBtn.dataset?.testid === 'unretweet') return;
        rememberTweet(retweetBtn);
    }, true);

    // ── 第二步：监听 DOM 变化，等待确认"转帖"按钮出现 ─────────
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!isElement(node)) continue;

                const confirmBtn = isConfirmRetweetButton(node) ? node : findConfirmButton(node);
                if (!confirmBtn) continue;
                if (clickedConfirmButtons.has(confirmBtn)) return;
                if (retweetConfirmInFlight) return;
                retweetConfirmInFlight = true;
                clickedConfirmButtons.add(confirmBtn);

                console.log('🔍 发现确认转帖按钮');

                // 快照当前目标推文（防止后续点击被覆盖）
                const targetSnapshot = pendingTweet;

                const tryClick = () => {
                    if (!isClickable(confirmBtn)) {
                        setTimeout(tryClick, 150);
                        return;
                    }

                    // 1. 确认转帖
                    confirmBtn.click();
                    console.log('✅ 转帖已确认');

                    // 2. 等弹窗关闭和 article 重绘后，再重新定位原帖点喜欢
                    setTimeout(() => {
                        likeTweet(resolvePendingArticle(targetSnapshot));

                        // 3. 关闭可能残留的弹窗
                        document.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Escape',
                            bubbles: true,
                            cancelable: true,
                        }));

                        // 4. 清空记录
                        if (pendingTweet === targetSnapshot) pendingTweet = null;
                        retweetConfirmInFlight = false;
                    }, 650);
                };

                setTimeout(tryClick, 80);
                return; // 找到一个就够了
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    console.log(`🚀 x自动转帖+精准喜欢脚本已启动 v${VERSION}`);
})();
