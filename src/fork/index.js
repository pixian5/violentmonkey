/*
 * fork 补丁聚合层：所有自有改动集中在这里加载。
 * 上游只需保留一行 `import '@/fork';`，其余逻辑都是新增文件，
 * 这样上游更新时只有这一行 import 可能冲突。
 *
 * 加载顺序有讲究：
 * 1. `guard` 必须最先执行，安装早期异常捕获（Safari 后台崩在求值阶段时才能留证据）
 * 2. `target` 提供构建目标识别
 * 3. 其余补丁按依赖顺序加载，每个补丁都用 safePatch 包裹，互不牵连
 */
import './guard';
import './target';
import './api-stubs';
import './safari-shims';
import { safePatch } from './guard';
import { installForkLogViewer, installPopupSettingsRoute } from './popup-safari';

// 只在弹窗页面安装 Safari 设置入口补丁与诊断日志查看器
if (__.EXT && !__.BG && !__.SW && location.pathname.includes('popup')) {
  safePatch('popup-settings-route', installPopupSettingsRoute);
  safePatch('popup-log-viewer', installForkLogViewer);
}
