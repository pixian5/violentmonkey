/*
 * Safari 的 Web 扩展清单裁剪。
 * Safari 不接受部分权限与键，这里由 Safari 打包脚本调用，
 * 避免把 Safari 特例写进上游的构建配置。
 */

const REMOVE_PERMISSIONS = ['notifications', 'webRequestBlocking'];

/**
 * @param {Object} manifest dist/manifest.json 的内容，会被就地修改
 * @return {Object} 同一个 manifest
 */
export function applySafariManifestOverrides(manifest) {
  // 运行时用它识别 Safari 构建（见 src/fork/target.js）
  manifest.fork = { ...manifest.fork, target: 'safari' };
  /*
   * Safari 的 MV2 后台页默认被视为非持久（non-persistent），
   * 缺少 `persistent` 时后台脚本可能根本不会被加载，
   * 表现就是：popup 能渲染，但 `runtime.sendMessage` 连不上后台，
   * 页面里报 "Violentmonkey cannot connect to the background page."
   * 上游依赖后台常驻（webRequest 监听 + 内存中的脚本索引），因此显式声明常驻。
   */
  if (manifest.background) manifest.background.persistent = true;
  if (manifest.browser_action) delete manifest.browser_action.browser_style;
  if (manifest.options_ui) delete manifest.options_ui.open_in_tab;
  manifest.permissions = (manifest.permissions || [])
  .filter(key => !REMOVE_PERMISSIONS.includes(key));
  manifest.optional_permissions = (manifest.optional_permissions || [])
  .filter(key => key !== 'downloads');
  if (!manifest.optional_permissions?.length) delete manifest.optional_permissions;
  delete manifest.commands?._execute_browser_action;
  return manifest;
}
