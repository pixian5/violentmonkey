/*
 * fork 补丁聚合层：所有自有改动集中在这里加载。
 * 上游只需保留一行 `import '@/fork';`，其余逻辑都是新增文件，
 * 这样上游更新时只有这一行 import 可能冲突。
 */
import './target';
import './api-stubs';
import './safari-shims';
import { installPopupSettingsRoute } from './popup-safari';

// 只在弹窗页面安装 Safari 设置入口补丁
if (__.EXT && !__.BG && !__.SW && location.pathname.includes('popup')) {
  installPopupSettingsRoute();
}
