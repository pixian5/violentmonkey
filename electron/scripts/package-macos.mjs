import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const buildDir = path.join(projectRoot, 'build');
const iconDir = path.join(buildDir, 'icons');
const iconsetDir = path.join(iconDir, 'violentmonkey.iconset');
const icnsPath = path.join(iconDir, 'violentmonkey.icns');
const sourceIcon = path.join(projectRoot, 'src', 'resources', 'icon.png');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')}\n${result.stderr || result.stdout || ''}`.trim());
  }
  return result;
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function prepareIcon() {
  ensureDirectory(iconDir);
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  ensureDirectory(iconsetDir);
  const sizes = [16, 32, 64, 128, 256, 512];
  sizes.forEach(size => {
    createIconVariant(size, 1);
    createIconVariant(size, 2);
  });
  run('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath]);
}

function createIconVariant(size, scale) {
  const pixels = size * scale;
  const fileName = scale === 1
    ? `icon_${size}x${size}.png`
    : `icon_${size}x${size}@2x.png`;
  run('sips', [
    '-z',
    `${pixels}`,
    `${pixels}`,
    sourceIcon,
    '--out',
    path.join(iconsetDir, fileName),
  ]);
}

function detectSigningIdentity() {
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const identities = result.stdout
  .split('\n')
  .map(line => line.match(/"([^"]+)"/)?.[1])
  .filter(Boolean);
  return identities.find(name => name.startsWith('Developer ID Application:'))
    || identities.find(name => name.startsWith('Apple Distribution:'))
    || identities.find(name => name.startsWith('Apple Development:'))
    || null;
}

function getElectronBuilderBin() {
  const binName = process.platform === 'win32'
    ? 'electron-builder.cmd'
    : 'electron-builder';
  return path.join(projectRoot, 'node_modules', '.bin', binName);
}

function buildMacApp(identity) {
  const archFlag = `--${process.arch}`;
  const env = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: identity ? 'true' : 'false',
  };
  if (identity) {
    env.CSC_NAME = identity;
  } else {
    delete env.CSC_NAME;
  }
  const result = spawnSync(getElectronBuilderBin(), [
    '--config',
    'electron-builder.yml',
    '--mac',
    'dir',
    archFlag,
  ], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  if (process.platform !== 'darwin') {
    console.error('macos:package can only run on macOS.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(projectRoot, 'dist', 'manifest.json'))) {
    console.error('dist/manifest.json was not found. Run the extension build first.');
    process.exit(1);
  }
  prepareIcon();
  const identity = detectSigningIdentity();
  if (identity) {
    console.log(`Using signing identity: ${identity}`);
  } else {
    console.log('No local signing identity found. Building unsigned app.');
  }
  buildMacApp(identity);
  const appDir = path.join(projectRoot, 'build', 'macos', `mac-${process.arch}`);
  console.log(`App bundle ready in ${appDir}`);
}

main();
