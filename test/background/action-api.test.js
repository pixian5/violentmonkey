import wrapActionApi from '@/fork/action-api';

const METHODS = ['setIcon', 'setBadgeText', 'setBadgeBackgroundColor', 'setTitle'];

describe('wrapActionApi', () => {
  test('returns a Promise for Chrome-style APIs that ignore the callback', () => {
    const calls = [];
    const api = {};
    for (const name of METHODS) {
      api[name] = (...args) => {
        calls.push([name, args.at(-1)]);
        // Chrome 138+ 的 Promise 形 API 传入回调时返回 undefined
        return undefined;
      };
    }
    const wrapped = wrapActionApi(api, METHODS);
    for (const name of METHODS) {
      const res = wrapped[name]({ tabId: 1 });
      expect(typeof res?.catch).toBe('function');
      expect(typeof res?.then).toBe('function');
    }
    // 回调仍然被传入以抑制 chrome.runtime.lastError
    expect(calls).toHaveLength(METHODS.length);
    expect(calls.every(([, args]) => typeof args === 'function')).toBe(true);
  });

  test('keeps the original Promise when the API returns one', async () => {
    const done = Promise.resolve('done');
    const api = { setTitle: () => done };
    const wrapped = wrapActionApi(api, ['setTitle']);
    await expect(wrapped.setTitle({})).resolves.toBe('done');
  });

  test('never throws synchronously when the API is missing or fails', () => {
    expect(() => wrapActionApi(undefined, METHODS)).not.toThrow();
    const missing = wrapActionApi(undefined, METHODS);
    for (const name of METHODS) {
      expect(typeof missing[name]).toBe('function');
      expect(typeof missing[name]().catch).toBe('function');
    }
    const throwing = wrapActionApi({
      setTitle: () => {
        throw new Error('boom');
      },
    }, ['setTitle']);
    expect(typeof throwing.setTitle({}).catch).toBe('function');
  });
});
