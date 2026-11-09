# 安装、更新与恢复

运行时建议：**Node.js 24+、Python 3.13、Go 1.27+**。Python 最低支持 3.11。包管理器安装其当前版本，安装器检查最低版本；VS Code 扩展由 Marketplace 提供当前兼容版本。因此这是可重复部署的配置方案，不是冻结所有软件版本的系统镜像。

## 在另一台机器获取仓库

仓库公开，任何人都可以获取。可在网页点击 **Code → Download ZIP** 并解压，或使用 Git：

```sh
git clone https://github.com/infra403/code-atelier.git
cd code-atelier
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
2. 打开 Markdown，运行 **纸页：进入／退出阅读模式**。左侧选中文字，点工具栏 **B / A / 荧光笔**。配色按钮用于修改默认颜色。
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


## 仅应用截图中的写作设置

只需阅读与美化时，先安装 Release 中的 VSIX，不必运行完整开发环境安装器。打开命令 **Preferences: Open User Settings (JSON)**，把 [config/writing.settings.json](../config/writing.settings.json) 中需要的设置键合并到已有 JSON 对象；不要替换整个设置文件。也可以在设置界面按键名逐项配置。

此文件只包含写作、主题和预览偏好，不包含 Python / Go / 前端 / Codex 的配置，也不含任何本机书库路径。截图使用其中的 17px 字号与 32px 编辑器行高；界面语言可单独安装中文语言包。

旧版兼容标识（主题名、`paperWriting.*`、本机 `vscode-claude-dev` 备份目录）继续保留，避免更名后丢失偏好或恢复入口。
