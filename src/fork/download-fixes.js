/*
 * GM_download 走 downloads API 时的两处修正。
 * 原本改在 `background/utils/download-via-api.js` 里，搬到 fork 层之后上游只留调用。
 */
import { vetUrl } from '@/background/utils/url';

/**
 * 相对地址按发起页解析：上游直接把 `opts.url` 交给 downloads API，
 * 相对路径会被浏览器当成无效地址。
 * @param {string} url
 * @param {string} srcUrl 发起页地址
 * @return {string}
 */
export const vetDownloadUrl = (url, srcUrl) => vetUrl(url, srcUrl, true);

/**
 * 下载出错时显式回一条 error 消息。上游调用 `req.cbe(error)`，
 * 前台收不到任何东西，脚本看不到失败原因。
 * @param {Object} req 请求对象
 * @param {string} reqId 请求 id
 * @param {string} message 错误信息
 */
export function reportDownloadError(req, reqId, message) {
  req.cb({
    id: reqId,
    [ERROR]: [message, 'DownloadError'],
    data: null,
    type: ERROR,
  });
}
