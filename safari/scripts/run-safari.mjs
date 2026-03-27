import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const appPath = path.join(
  projectRoot,
  'build',
  'safari',
  'DerivedData',
  'Build',
  'Products',
  'Debug',
  'ViolentmonkeySafari.app'
);
const extensionBundleId = 'io.violentmonkey.safari.Extension';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function stopOldApp() {
  run('pkill', ['-x', 'ViolentmonkeySafari']);
}

function openApp() {
  const result = run('open', [appPath]);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to open Safari host app.');
  }
}

function waitForExtension(timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const result = run('pluginkit', ['-m', '-A', '-D', '-i', extensionBundleId]);
    if (result.status === 0 && result.stdout.includes(extensionBundleId)) {
      return result.stdout.trim();
    }
    sleep(500);
  }
  throw new Error(`Timed out waiting for ${extensionBundleId} to register in pluginkit.`);
}

function main() {
  stopOldApp();
  openApp();
  const registered = waitForExtension();
  console.log(registered);
}

main();
