# Claude 风格 VS Code：写作 + Python / 前端 / Go / Codex

将暖白纸张、陶土色强调、Markdown 标记工具栏和开发环境一起带到 Mac 与 Windows。安装会合并设置，并在本机保存备份。

## 包含内容

- **纸页 · Claude**：完整主题、暖白 Markdown 预览、留白、光标和悬停样式。
- **写作工具栏**：加粗、六种文字色、六种高亮色、斜体、下划线和删除线。颜色配置一次，按钮显示当前色，再点同色可取消标记。
- **Python**：Pylance、Ruff、调试器；保存时格式化及整理导入。
- **前端**：JavaScript / TypeScript / React / Vue、ESLint、Prettier、Node 调试。
- **Go**：语言扩展、gopls 0.24.0、Delve 1.27.2、格式化和导入整理。
- **Codex**：OpenAI 官方扩展、中文界面。每台新机器单独登录自己的账户。
- **阅读模式**：一键打开左侧划词编辑区和右侧阅读预览；支持目录、跨分册上一章／下一章、书架搜索和继续上次章节。

## 一键阅读电子书

在 VS Code 命令面板运行 **纸页：添加书库**，选择包含多本书的文件夹。书库路径仅保存在这台机器上；Mac、Windows 分别添加自己的目录。

打开一本书的 Markdown 后，点击工具栏 **进入／退出阅读模式**（预览图标），或从命令面板执行 **纸页：进入／退出阅读模式**：

- 自动左右分屏：左侧 40% 用于选词、加粗、颜色和高亮，右侧 60% 用于阅读。无需手动分屏或打开 Markdown Preview。
- 图表上方可点击 **放大阅读**：矢量图按清晰字号打开，可拖动平移、滚轮缩放，点击「全图」查看整体；按 Esc 回到原阅读位置。
- 目录按 **分册 → 子分类 → 章节** 显示，子分类默认全部展开，可手动收起。预览页顶固定显示 **上一章、目录、下一章、切换书籍**，章末也有翻页入口；翻章后左右两边保持同一章节。
- 底部状态栏可搜索章节和书籍；从书架选书会自动进入阅读模式，并回到该书上次打开的章节。
- 目录优先使用书内 `SUMMARY.md` / `CONTENTS.md` / `README.md` 的链接顺序，递归展开分册，去重并排除代码、审校等辅助材料。无目录时按文件名自然排序。
- 再次点击阅读模式恢复进入前的分栏布局。原有文件和未保存的编辑不会被主动关闭或覆盖。

设置中可搜索 `paperWriting.readingEditorRatio` 调整左右比例。书库文件变化后可运行 **纸页：刷新书架目录**。导航添加在预览中，不会往书稿正文插入按钮或链接。

阅读模式适用于本地 Markdown 电子书；PDF、EPUB、压缩包继续由相应阅读器处理。特别大的书或不规范目录可能需要整理其目录链接；扫描具有深度和数量上限，避免阻塞编辑器。

运行时建议：**Node.js 24+、Python 3.13、Go 1.27+**。Python 最低支持 3.11。包管理器安装其当前版本，安装器检查最低版本；VS Code 扩展由 Marketplace 提供当前兼容版本。因此这是可重复部署的配置方案，不是冻结所有软件版本的系统镜像。

## 在另一台机器获取仓库

仓库为私有，需要使用有访问权限的 GitHub 账户。可在网页点击 **Code → Download ZIP** 并解压，或使用 Git：

```sh
git clone https://github.com/infra403/vscode-claude-dev-setup.git
cd vscode-claude-dev-setup
```

### Mac

先安装 [Homebrew](https://brew.sh)，然后在仓库目录运行：

```sh
bash install-macos.sh
```

脚本会安装缺少的 VS Code，并通过 Homebrew 安装 Node 24、Python 3.13、Go。接着安装扩展、Go 工具并合并设置。Homebrew 会管理这些开发工具，可能更新已有的同名软件；已有 nvm/虚拟环境继续按项目选择版本。

如果开发工具已经齐全，希望仅使用现有工具：

```sh
npm ci --omit=dev
npm run setup -- --dry-run
npm run setup
```

### Windows

需要 Windows 10/11 和 [App Installer / WinGet](https://learn.microsoft.com/windows/package-manager/winget/)。在仓库目录打开 PowerShell：

```powershell
.\install-windows.ps1
```

脚本通过 WinGet 安装缺少的 VS Code、Node LTS、Python 3.13 和 Go；安装程序要求的协议和权限由你自行确认。已存在的软件不强制升级，若版本过旧会明确提示。安装完成后可重新打开 PowerShell，再执行：

```powershell
.\install-windows.ps1 -ConfigureOnly
```

如果 PowerShell 的脚本策略阻止运行，直接使用以下命令，无须修改执行策略：

```powershell
winget install --exact --id Microsoft.VisualStudioCode --source winget
winget install --exact --id OpenJS.NodeJS.LTS --source winget
winget install --exact --id Python.Python.3.13 --source winget
winget install --exact --id GoLang.Go --source winget
# 安装后重新打开终端，再回到仓库目录：
npm.cmd ci --omit=dev
node scripts/setup.mjs
```

## 安装后

1. 重新加载 VS Code，新建终端；推荐使用最新稳定版 VS Code。
2. 打开 Markdown，按 Mac `⌘K V` / Windows `Ctrl+K V` 打开侧边预览。左侧选中文字，点工具栏 **B / A / 荧光笔**。配色按钮用于修改默认颜色。
3. Python 项目执行 **Python: Select Interpreter**，选择项目自己的 `.venv`；前端继续使用项目的 package.json、ESLint 和 Prettier 配置；Go 打开含 `go.mod` 的文件夹。
4. 命令面板执行 **Codex: Open Codex Sidebar**，完成登录。选中代码可通过 **Add to Codex Chat** 加入上下文。
5. 主题随 VS Code 设置启用；写作标记命令需要你自行信任相应工作区。安装器不会修改工作区信任、Codex 权限或账户设置。

Mermaid 图表使用当前 VS Code 内置渲染器，预览样式随主题扩展安装。旧版 VS Code 请先升级；如果装过旧 `bierner.markdown-mermaid` 且图表冲突，请在扩展界面停用重复渲染器。

## 只安装主题和编辑器配置

已有自己的语言工具链，可以不让本方案设置解释器、终端路径或安装 Go 工具：

```sh
npm ci --omit=dev
node scripts/setup.mjs --settings-only
```

这仍安装扩展、主题和各语言编辑器偏好。要只合并设置、不安装任何扩展，再加 `--skip-extensions`。

安装器默认写入 VS Code **默认配置文件**的用户设置。使用其他 Profile / Insiders 时，请用 `--settings` 指定其设置文件，并自行在目标 Profile 安装扩展；避免把默认 Profile 误认为当前 Profile。自定义安装位置可使用 `--code` 指定 VS Code CLI。

```sh
node scripts/setup.mjs --dry-run
node scripts/setup.mjs --settings "/path/to/settings.json" --settings-only --skip-extensions
```

## 备份、更新与恢复

设置中的注释和无关选项会保留；文字色及高亮色已有选择也会保留。解析失败时不会覆盖设置。每次安装在目标 `settings.json` 旁的 `vscode-claude-dev/backups/` 生成本机备份和恢复记录，不上传 GitHub。

Mac 会在 `.zshrc`（或已设置的 `ZDOTDIR`）写入带标记的 VS Code 专用 PATH 块，确保 nvm 等初始化不会抢回旧默认版本。此块只在 VS Code 终端中生效；不修复或覆盖其他 shell 配置。Windows 使用 VS Code 的终端环境配置。

```sh
# 更新仓库后重新应用，保留其他设置和你选择的标记颜色
git pull --ff-only
npm ci --omit=dev
npm run setup

# 恢复某次安装管理的设置；安装后被你再次改过的值会保留
node scripts/setup.mjs --restore "/path/to/vscode-claude-dev/backups/TIMESTAMP"
```

恢复不卸载扩展和运行时；Mac shell 文件若在安装后又变化，会保留当前文件并提示手动移除本方案标记块。

## 仓库维护与验证

```sh
npm ci
npm run check
npm run build:extension
```

`extensions/paper-writing/` 是自定义主题和标记扩展的完整源代码，`dist/` 包含可直接安装的 VSIX。第三方扩展仅存 ID，不打包其代码或登录数据。修改扩展后应同步更新版本及打包文件。

自动检查覆盖：JSONC 合并、重复执行、备份恢复、Mac/Windows 路径、标记往返与多色选择、源码和 VSIX 完整性。GitHub Actions 在 Mac 和 Windows 上执行这些检查。包管理器安装与真实 VS Code 登录仍取决于目标机器的网络、权限和账户。

源机器的 Python、前端、Go 和 Delve 已完成示例运行验证。仓库不包含任何个人项目、书稿、账户令牌、聊天记录、原始 `.zshrc` 或本机绝对路径。

参考：[VS Code CLI](https://code.visualstudio.com/docs/configure/command-line) · [设置说明](https://code.visualstudio.com/docs/configure/settings) · [Codex IDE](https://developers.openai.com/codex/ide/)

### 图片单独全屏（鼠标操作）

图表旁和「放大阅读」工具栏均有 **图片单独全屏 ↗**。点击后在本机默认浏览器打开独立矢量看图页，再点 **图片单独全屏 ⛶**，屏幕只保留图表，VS Code 界面和浏览器标签栏都会隐藏。

- 鼠标滚轮缩放，按住左键拖动；「全图」查看完整关系，「清晰字号」恢复阅读尺寸。
- 全屏时操作栏会自动隐藏；移动鼠标显示，再点 **退出图片全屏**，也可按 Esc。
- 保留原图的颜色和矢量文字；原来的双栏和书稿不受影响。图表只在本机处理，不上传外部服务。
- 如需同时保留 VS Code 工具栏，预览标签栏另有「预览铺满屏幕」按钮。再次点击退出会恢复原双栏。
