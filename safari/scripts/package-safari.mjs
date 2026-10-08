import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applySafariManifestOverrides } from '../manifest-overrides.js';

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

/** Safari 不支持部分权限与键，转换前先按 Safari 规则改写 dist/manifest.json */
function adaptManifestForSafari() {
  const manifestPath = path.join(distPath, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.writeFileSync(manifestPath, `${JSON.stringify(applySafariManifestOverrides(manifest), null, 2)}\n`);
  console.log('Adapted manifest.json for Safari.');
}

function generateSafariProject() {
  adaptManifestForSafari();
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
  if (identity) {
    const identityType = identity.split(':', 1)[0];
    args.splice(-1, 0, `CODE_SIGN_IDENTITY=${identityType}`);
  }
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

/**
 * 把构建产物装进 /Applications 并清掉构建目录里的副本。
 *
 * 两点都不能省：
 * 1. 只构建不安装的话，/Applications 里会长期留着旧产物（曾经是 adhoc 签名的），
 *    Safari 不会加载没有团队签名的宿主 App，于是「明明装了却在 Safari 里看不到」。
 * 2. 不清构建目录副本的话，Safari 会去加载 DerivedData 里那份而不是 /Applications 的，
 *    导致扩展条目重复、行为与新产物不一致（与 homepage 项目踩过的坑同源）。
 */
function installHostApp(productPath) {
  const appPath = path.join('/Applications', 'ViolentmonkeySafari.app');
  spawnSync('pkill', ['-x', 'ViolentmonkeySafari']);
  spawnSync('rm', ['-rf', appPath]);
  const copied = spawnSync('cp', ['-R', productPath, appPath], { encoding: 'utf8' });
  if (copied.status !== 0) {
    throw new Error(`Failed to install ${appPath}\n${copied.stderr || ''}`.trim());
  }
  const verified = spawnSync('codesign', ['-vv', '--deep', appPath], { encoding: 'utf8' });
  if (verified.status !== 0) {
    throw new Error(`Installed app failed signature verification\n${verified.stderr || ''}`.trim());
  }
  const info = spawnSync('codesign', ['-dv', appPath], { encoding: 'utf8' });
  const teamId = `${info.stdout}${info.stderr}`.match(/TeamIdentifier=([^\s]+)/)?.[1];
  if (!teamId || teamId === 'not set') {
    throw new Error('Installed app is not signed with a team identity (adhoc). Safari will not load it.');
  }
  const embeddedProfile = fs.existsSync(path.join(appPath, 'Contents', 'embedded.provisionprofile'));
  spawnSync('rm', ['-rf',
    path.join(path.dirname(productPath), 'ViolentmonkeySafari.app'),
    path.join(path.dirname(productPath), 'ViolentmonkeySafari Extension.appex'),
  ]);
  // xcodebuild 构建时会把 LaunchServices 注册指向 DerivedData 那份，装完必须重新注册，
  // 否则 Safari 认的还是刚被删掉的构建副本，扩展看起来像「装了但没生效」。
  const lsregister = '/System/Library/Frameworks/CoreServices.framework'
    + '/Versions/Current/Frameworks/LaunchServices.framework/Support/lsregister';
  if (fs.existsSync(lsregister)) {
    spawnSync(lsregister, ['-f', '-R', '-trusted', appPath]);
  }
  console.log(`Installed ${appPath}`);
  console.log(`  team=${teamId}, profile=${embeddedProfile ? 'embedded' : 'none (免 7 天续期)'}`);
  console.log('Next: open the app once, then enable it in Safari > Settings > Extensions.');
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
  const productPath = path.join(derivedDataPath, 'Build', 'Products', 'Debug', 'ViolentmonkeySafari.app');
  if (process.env.SAFARI_INSTALL === '0') {
    console.log(`Safari host app ready in ${productPath} (install skipped)`);
    return;
  }
  installHostApp(productPath);
}

main();
