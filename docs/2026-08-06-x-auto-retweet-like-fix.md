# 2026-08-06 X 自动转帖/喜欢修复

- 修复范围：`脚本/x自动转帖、转帖后自动喜欢.js`。
- 根因：确认“转帖”按钮依赖 X 页面动态 class 完全匹配，页面样式变更后无法识别；`@exclude` 写在 UserScript 元数据块外，也不会被 Violentmonkey 识别。
- 处理：优先使用稳定的 `data-testid="retweetConfirm"`，并用 role、ARIA 和中英文按钮文本做兜底。
- 处理：记录原帖 article 与 status id，转帖确认后如 DOM 重绘则重新定位原帖，再只在该 article 内点击喜欢。
- 验证：`node --check 脚本/x自动转帖、转帖后自动喜欢.js` 通过；最小 DOM smoke test 确认“确认转帖”和“原帖喜欢”各触发 1 次。
