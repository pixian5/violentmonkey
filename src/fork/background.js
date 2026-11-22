/*
 * 后台专用补丁：需要访问上游后台模块的命令与 API 包装。
 *
 * 顺序要求：`index`（上游入口）必须最后导入，这样前面的补丁都已在它求值前生效。
 * 但因为 ES module 的导入会提前求值，真正保证顺序的是 `background/index.js`
 * 里 `import '@/fork/background'` 出现在其它 import 之前 —— 这里再显式声明一次依赖关系。
 */
import './index';
import './action-api-patch';
import './db-extensions';
import './diagnostics';
