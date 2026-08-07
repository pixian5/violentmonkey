# 2026-08-07 全项目代码审查修复

## 问题与根因

- 浏览器端模块使用了 `process.env`，但 Webpack 只向 `__` 对象注入构建常量，导致产物在扩展上下文抛出 `ReferenceError`。
- OAuth 授权流程在模块级别共享 resolver 和计时器，重复授权时旧请求可以覆盖新请求状态。
- Safari 打包虽会检测 `Developer ID Application` 证书，但传给 Xcode 的签名身份被固定为 `Apple Development`。
- X 转帖确认按钮的 `data-testid` 可能位于不可点击的内部节点，转换到父级点击目标后再验证会丢失该标识。
- README 同时使用 pnpm 和 Yarn 指令，与 `only-allow pnpm` 的安装约束冲突。

## 修复

- 浏览器端统一使用 `__.TARGET` 和 `__.VM_VER`，并用 ESLint 禁止 `src/` 再引用 `process` 全局变量。
- OAuth 每次调用使用独立 attempt 状态；替换、超时、失败和成功都统一清理监听器、计时器、标签页和 Promise。
- Safari 打包按实际检测到的证书类型选择 `Apple Development` 或 `Developer ID Application`，避免自动签名与完整证书名称冲突。
- Safari 构建移除平台不支持的 `downloads` 可选权限，下载能力回退到原生请求模式。
- X 脚本使用内部节点识别按钮，使用父级可操作节点执行点击，并新增最小 DOM 回归测试。
- 文档中的安装、Electron 和 Safari 命令全部统一为 pnpm。

## 验证结果

- `pnpm run ci` 通过：8 个测试套件、49 个测试、9 个快照。
- `pnpm build:extension` 通过，普通扩展生产产物成功生成。
- `pnpm safari:dist` 通过，Safari 宿主与扩展使用 Apple Development 证书签名成功。
- `pnpm safari:run` 通过，`pluginkit` 确认 `io.violentmonkey.safari.Extension` 已注册。
- `codesign --verify --deep --strict` 通过。
- `src/` 和普通/Safari 生产产物中 `process.env` 均为零命中。
- X 自动转帖脚本通过 `node --check` 和新增的内部 `data-testid` DOM 回归测试。

## 版本

- 项目工程版本：`0.0.3 -> 0.0.4`
- Package 版本：`2.46.3 -> 2.46.4`
- Beta 序号：`5 -> 6`
- 生成的扩展 manifest 版本：`2.46.6`
- X 自动转帖脚本：`4.0.3 -> 4.0.4`
