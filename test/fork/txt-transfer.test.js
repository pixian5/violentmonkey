jest.mock('@/common', () => ({
  ...jest.requireActual('@/common'),
  i18n: name => name,
  sendCmdDirectly: jest.fn(() => Promise.resolve()),
}));

import { sendCmdDirectly } from '@/common';
import {
  buildTextBackup,
  exportTextBackup,
  importTextScriptFile,
  parseTextBackup,
  withTimeout,
} from '@/fork/txt-transfer';

// jsdom 未实现 Blob.prototype.text，用等价的最小结构代替 File
const makeFile = (content, name) => ({ name, text: () => Promise.resolve(content) });

const makeDeps = (overrides = {}) => ({
  report: jest.fn(),
  reportDebug: jest.fn(),
  parseScriptForImport: jest.fn(() => Promise.resolve({ update: { meta: { name: 'S' }, props: { uri: 'uri' } } })),
  refreshAfterImport: jest.fn(() => Promise.resolve()),
  sendValues: jest.fn(() => Promise.resolve()),
  options: { get: jest.fn(() => false) },
  ...overrides,
});

describe('parseTextBackup', () => {
  test('recognizes a text backup', () => {
    const raw = JSON.stringify({ format: 'violentmonkey-text-backup', scripts: [] });
    expect(parseTextBackup(raw)).toEqual({ format: 'violentmonkey-text-backup', scripts: [] });
  });

  test('rejects other content', () => {
    expect(parseTextBackup('not json')).toBe(null);
    expect(parseTextBackup(JSON.stringify({ format: 'other', scripts: [] }))).toBe(null);
    expect(parseTextBackup(JSON.stringify({ format: 'violentmonkey-text-backup', scripts: 'no' }))).toBe(null);
  });
});

describe('withTimeout', () => {
  test('resolves before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'late')).resolves.toBe('ok');
  });

  test('rejects with the label after the timeout', async () => {
    jest.useFakeTimers();
    const pr = withTimeout(new Promise(() => {}), 100, 'too slow');
    jest.advanceTimersByTime(150);
    await expect(pr).rejects.toThrow('too slow');
    jest.useRealTimers();
  });
});

describe('importTextScriptFile', () => {
  test('imports a single script file', async () => {
    const deps = makeDeps();
    const file = makeFile('// ==UserScript==\n// @name S\n', 'S.user.js');
    await importTextScriptFile(file, deps);
    expect(deps.parseScriptForImport).toHaveBeenCalledWith(
      { isNew: true },
      '// ==UserScript==\n// @name S\n',
      'S.user.js'
    );
    expect(deps.refreshAfterImport).toHaveBeenCalled();
    expect(deps.report).toHaveBeenCalled();
    expect(sendCmdDirectly).not.toHaveBeenCalled();
  });

  test('rejects an empty file', async () => {
    const deps = makeDeps();
    await importTextScriptFile(makeFile('   ', 'empty.txt'), deps);
    expect(deps.parseScriptForImport).not.toHaveBeenCalled();
    expect(deps.report).toHaveBeenCalledWith(expect.any(Error), 'empty.txt', 'critical');
  });

  test('imports a text backup and rebuilds the index', async () => {
    const deps = makeDeps({
      options: { get: key => key === 'importScriptData' || key === 'importSettings' },
    });
    const backup = {
      format: 'violentmonkey-text-backup',
      version: 1,
      settings: { sync: 'secret' },
      scripts: [
        { name: 'A', code: 'code-a', custom: {}, config: {}, position: 1, props: {}, values: { k: 1 } },
      ],
    };
    await importTextScriptFile(makeFile(JSON.stringify(backup), 'backup.txt'), deps);
    expect(deps.parseScriptForImport).toHaveBeenCalledTimes(1);
    expect(deps.sendValues).toHaveBeenCalledWith({ uri: { k: 1 } });
    // 设置备份里不含同步凭据
    const setOptions = sendCmdDirectly.mock.calls.find(([cmd]) => cmd === 'SetOptions');
    expect(setOptions).toBeTruthy();
    expect(setOptions[1]).not.toHaveProperty('sync');
    expect(sendCmdDirectly).toHaveBeenCalledWith('RebuildScriptIndex', null, expect.anything());
  });
});

describe('exportTextBackup', () => {
  const makeScript = (id, name, position) => ({
    script: {
      meta: { name },
      custom: { c: 1 },
      config: { enabled: 1 },
      props: { id, position, uri: `uri-${id}`, lastModified: 111, lastUpdated: 222 },
    },
    code: `code-${id}`,
  });

  test('builds a text backup without sync credentials', async () => {
    const blob = buildTextBackup({
      data: { items: [makeScript(1, 'A', 1), makeScript(2, 'A', 2)] },
      withValues: false,
      settings: { sync: 'secret', other: 1 },
      normalizeFilename: name => name,
    });
    const backup = blob;
    expect(backup.format).toBe('violentmonkey-text-backup');
    expect(backup.version).toBe(1);
    expect(backup.settings).not.toHaveProperty('sync');
    expect(backup.settings.other).toBe(1);
    expect(backup.scripts.map(s => s.name)).toEqual(['A', 'A_2']);
    expect(backup.scripts[0]).toMatchObject({ code: 'code-1', position: 1, values: undefined });
  });

  test('exports script data by id when requested', async () => {
    const blob = buildTextBackup({
      data: { items: [makeScript(7, 'B', 1)], values: { 7: { stored: true } } },
      withValues: true,
      settings: {},
      normalizeFilename: name => name,
    });
    const backup = blob;
    expect(backup.scripts[0].values).toEqual({ stored: true });
  });
});

describe('exportTextBackup Blob', () => {
  test('returns a plain-text Blob with content', async () => {
    const blob = await exportTextBackup({
      data: { items: [] },
      withValues: false,
      settings: {},
      normalizeFilename: name => name,
    });
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(blob.size).toBeGreaterThan(0);
  });
});
