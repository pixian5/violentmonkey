# 2026-08-06 X 自动转帖/喜欢修复

- 修复范围：`脚本/x自动转帖、转帖后自动喜欢.js`。
- 根因：确认“转帖”按钮依赖 X 页面动态 class 完全匹配，页面样式变更后无法识别；`@exclude` 写在 UserScript 元数据块外，也不会被 Violentmonkey 识别。
- 处理：优先使用稳定的 `data-testid="retweetConfirm"`，并用 role、ARIA 和中英文按钮文本做兜底。
- 处理：记录原帖 article 与 status id，转帖确认后如 DOM 重绘则重新定位原帖，再只在该 article 内点击喜欢。
- 继续加固：仅在 8 秒内捕获到原帖时才自动确认转帖，避免误点用户手动打开但未记录来源的菜单。
- 继续加固：点击第一层转帖后主动扫描确认菜单两次，覆盖“菜单已存在/节点未新增”导致 MutationObserver 漏触发的情况。
- 继续加固：使用 WeakSet 记录已处理确认按钮，并限制等待可点击的重试次数，避免重复确认或永久 in-flight。
- 验证：`node --check 脚本/x自动转帖、转帖后自动喜欢.js` 通过；`pnpm exec eslint 脚本/x自动转帖、转帖后自动喜欢.js --no-cache --no-ignore` 通过；最小 DOM smoke test 覆盖正常路径、无原帖保护、主动扫描路径。
