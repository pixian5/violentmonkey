/*
 * Safari 的注入策略差异。
 *
 * 原先直接写在 `background/utils/preinject-core.js` 里（带 IS_SAFARI 判断），
 * 抽到这里之后，上游文件只剩两次函数调用，自有判断不再铺在上游源码中。
 */
import { normalizeRealm } from '@/background/utils/preinject-prepare';
import { IS_SAFARI } from './target';

/**
 * Safari 只支持 content 域注入，page 域不可用。
 * @param {string} value 选项里的注入域
 * @return {string}
 */
export const normalizeInjectInto = value => (IS_SAFARI ? CONTENT : normalizeRealm(value));

/** Safari 无法通过 cookie 传递 blob 注入数据，必须关掉 XHR 注入 */
export const shouldDisableXhrInject = () => IS_SAFARI;
