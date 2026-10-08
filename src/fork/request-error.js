/*
 * HttpRequest 出错时的回调构造。
 *
 * 上游出错只回一条 `error` 消息，前台 `onloadend` 永远不会触发，
 * 脚本里等 `loadend` 收尾的逻辑会一直挂住。这里补发一条 loadend。
 * 放在 fork 层之后，`background/utils/requests.js` 只剩一次调用。
 */

/**
 * @param {(res: Object) => void} cb 上游的消息回调
 * @param {string} id 请求 id
 * @param {Object} req 请求对象
 * @return {(err: Error) => void} 错误回调
 */
export function makeRequestErrorCb(cb, id, req) {
  return err => {
    cb({
      id,
      [ERROR]: [err.message || `${err}`, err.name],
      data: null,
      type: ERROR,
    });
    cb({
      id,
      data: {
        finalUrl: req.url,
        [kResponse]: null,
        [kResponseHeaders]: null,
        readyState: 4,
        status: 0,
        statusText: '',
      },
      type: 'loadend',
    });
  };
}
