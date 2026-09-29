/*
 * 构建目标识别。
 *
 * 上游把 `__.*` 当作编译期常量由 webpack 内联，运行期并不存在 `__` 对象，
 * 因此这里不用常量注入（也就不必改动上游构建配置）。
 * Safari 打包脚本会在 manifest 中写 `fork.target`（见 safari/manifest-overrides.js），
 * 运行期读它即可。必须排在其它补丁模块之前导入。
 */

/** @type {string} 当前构建目标，普通构建为空串 */
export const FORK_TARGET = __.EXT
  ? (chrome.runtime.getManifest().fork?.target || '')
  : '';

/** 是否是 Safari 构建 */
export const IS_SAFARI = FORK_TARGET === 'safari';
