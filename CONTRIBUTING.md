# 参与 Code Atelier

欢迎贡献主题、功能、修复、文档、翻译和可复现的示例。

## 本地开发

需要 Node.js 24+。克隆后运行：

```sh
npm ci
npm run check
npm run build:extension
```

扩展在 `extensions/paper-writing/`，不依赖编译步骤。使用 VS Code CLI 启动独立的开发窗口（macOS shell 和 Windows PowerShell 均可）：

```sh
code --extensionDevelopmentPath="$PWD/extensions/paper-writing" examples/studio-guide
```

也可安装生成的 VSIX，在单独的 VS Code Profile 中验证。不要在自己的唯一一份书稿上测试编辑操作。

## 项目结构

| 路径 | 作用 |
| --- | --- |
| `extensions/paper-writing/` | 主题、标记、阅读导航与独立图表查看器 |
| `config/` | 可迁移设置与第三方扩展 ID |
| `scripts/` | JSONC 合并、安装与恢复 |
| `tests/` | Node 内置测试运行器的验证 |
| `examples/studio-guide/` | 可公开、可修改的原创示例书 |
| `docs/screenshots/` | 实际运行截图及拍摄说明 |
| `dist/` | 对应版本的 VSIX 与 SHA-256 |

## 提交改动

先描述问题、触发方式与预期效果。功能改动应包含有意义的验证；单纯文案和样式调整无需镜像实现的测试。涉及 UI 时，提供用原创示例拍摄的实际截图。不要提交私人书稿、账户信息、绝对书库路径或本地备份。

兼容性标识目前保留为 `local.paper-writing`、`paperWriting.*` 和主题 `纸页 · Claude`。调整这些标识前请设计迁移方式；仅更名项目不应重置已有用户的主题和配色。

维护 `CHANGELOG.md`；运行检查并说明尚未验证的平台。GitHub Actions 在 macOS 和 Windows 上检查测试、打包和 Windows 脚本语法。它不等同于目标机器上的登录、运行时安装和完整 GUI 验收。

## 打包发布

维护者同步更新扩展、根包、安装脚本与测试中的版本引用；重新生成 `dist/` 中的 VSIX 与 `SHA256SUMS`，并检查压缩包内容。

确认两个平台的检查通过后，为对应提交创建版本标签与 GitHub Release，附上 VSIX 和校验和。检查 Release 下载与 README 截图链接可公开访问。npm 根包保留 `private: true`，避免误发到 npm；这不影响仓库采用 MIT 开源。
