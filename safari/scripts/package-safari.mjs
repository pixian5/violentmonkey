import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const buildRoot = path.join(projectRoot, 'build', 'safari');
const projectRootDir = path.join(buildRoot, 'ViolentmonkeySafari');
const xcodeprojPath = path.join(projectRootDir, 'ViolentmonkeySafari.xcodeproj');
const pbxprojPath = path.join(xcodeprojPath, 'project.pbxproj');
const derivedDataPath = path.join(buildRoot, 'DerivedData');
const distPath = path.join(projectRoot, 'dist');
const appBundleId = 'io.violentmonkey.safari';
const extensionBundleId = `${appBundleId}.Extension`;

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

function detectSigningIdentity() {
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const identities = result.stdout
  .split('\n')
  .map(line => line.match(/"([^"]+)"/)?.[1])
  .filter(Boolean);
  return identities.find(name => name.startsWith('Apple Development:'))
    || identities.find(name => name.startsWith('Developer ID Application:'))
    || null;
}

function detectTeamId(identity) {
  if (!identity) return null;
  const result = spawnSync('/bin/zsh', ['-lc', `security find-certificate -c ${JSON.stringify(identity)} -p | openssl x509 -noout -subject`], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return result.stdout.match(/OU=([A-Z0-9]+)/)?.[1] || null;
}

function generateSafariProject() {
  const result = spawnSync('xcrun', [
    'safari-web-extension-converter',
    distPath,
    '--project-location', buildRoot,
    '--app-name', 'ViolentmonkeySafari',
    '--bundle-identifier', appBundleId,
    '--swift',
    '--macos-only',
    '--no-open',
    '--no-prompt',
    '--force',
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function patchBundleIdentifiers() {
  const source = fs.readFileSync(pbxprojPath, 'utf8');
  const patched = source
  .replaceAll(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, match => (
    match.includes('.Extension;')
      ? `PRODUCT_BUNDLE_IDENTIFIER = ${extensionBundleId};`
      : `PRODUCT_BUNDLE_IDENTIFIER = ${appBundleId};`
  ));
  fs.writeFileSync(pbxprojPath, patched, 'utf8');
}

function buildSafariHostApp(identity, teamId) {
  const args = [
    '-project', xcodeprojPath,
    '-scheme', 'ViolentmonkeySafari',
    '-configuration', 'Debug',
    '-derivedDataPath', derivedDataPath,
    'build',
  ];
  const env = { ...process.env };
  if (identity) args.splice(-1, 0, 'CODE_SIGN_IDENTITY=Apple Development');
  if (teamId) args.splice(-1, 0, `DEVELOPMENT_TEAM=${teamId}`);
  const result = spawnSync('xcodebuild', args, {
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
    console.error('safari:package can only run on macOS.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(distPath, 'manifest.json'))) {
    console.error('dist/manifest.json was not found. Run the Safari extension build first.');
    process.exit(1);
  }
  const identity = detectSigningIdentity();
  const teamId = detectTeamId(identity);
  if (identity) {
    console.log(`Using signing identity: ${identity}`);
  } else {
    console.log('No local Apple development identity found. Xcode will use its default signing behavior.');
  }
  if (teamId) {
    console.log(`Using development team: ${teamId}`);
  }
  generateSafariProject();
  patchBundleIdentifiers();
  buildSafariHostApp(identity, teamId);
  console.log(`Safari host app ready in ${path.join(derivedDataPath, 'Build', 'Products', 'Debug')}`);
}

main();
