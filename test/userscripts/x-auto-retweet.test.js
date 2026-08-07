const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(
  __dirname,
  '../../脚本/x自动转帖、转帖后自动喜欢.js',
), 'utf8');

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('clicks the actionable parent when retweetConfirm is on an inner node', async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get: () => 10 },
    offsetWidth: { configurable: true, get: () => 10 },
  });
  document.body.innerHTML = `
    <article>
      <a href="/test/status/123"></a>
      <button data-testid="retweet"></button>
    </article>
  `;
  Function(source)();

  document.querySelector('[data-testid="retweet"]').click();
  const actionTarget = document.createElement('div');
  actionTarget.setAttribute('role', 'menuitem');
  actionTarget.innerHTML = '<span data-testid="retweetConfirm"></span>';
  const onClick = jest.fn();
  actionTarget.addEventListener('click', onClick);
  document.body.append(actionTarget);

  await Promise.resolve();
  jest.advanceTimersByTime(100);

  expect(onClick).toHaveBeenCalledTimes(1);
});
