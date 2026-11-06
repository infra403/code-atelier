import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { parseSettings, mergeSettings, restoreSettings, settingsPath, writeAtomic } from './settings.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { values: args } = parseArgs({ options: {
  'dry-run': { type: 'boolean' }, 'skip-extensions': { type: 'boolean' },
  'skip-go-tools': { type: 'boolean' }, 'skip-shell': { type: 'boolean' },
  'settings-only': { type: 'boolean' }, settings: { type: 'string' },
  code: { type: 'string' }, restore: { type: 'string' }, help: { type: 'boolean' }
}});
if (args.help) {
  console.log('npm run setup -- [--dry-run] [--settings FILE] [--settings-only] [--skip-extensions] [--skip-go-tools] [--skip-shell] [--code CLI] [--restore BACKUP_DIR]');
  process.exit(0);
}
const home = os.homedir(), win = process.platform === 'win32';
const target = path.resolve(args.settings || settingsPath(process.platform, home));
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '{}\n';
const output = (cmd, argv = [], options = {}) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const binRoot = win ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'vscode-claude-dev', 'bin') : path.join(home, '.local', 'share', 'vscode-claude-dev', 'bin');
const shellStart = '# >>> VS Code Python / frontend / Go development >>>';
const shellEnd = '# <<< VS Code Python / frontend / Go development <<<';
const quoteSh = value => "'" + value.replaceAll("'", "'\\''") + "'";

function run(cmd, argv, env = process.env) {
  console.log(`运行：${path.basename(cmd)} ${argv.join(' ')}`);
  // cmd.exe is needed only for the official Windows code.cmd launcher.
  // Reject shell metacharacters before quoting instead of interpolating arbitrary input.
  let result;
  if (win && /\.(cmd|bat)$/i.test(cmd)) {
    const tokens = [cmd, ...argv];
    if (tokens.some(t => /["%\r\n!&|<>^]/.test(t))) throw new Error('Windows CLI 路径包含不支持的 shell 字符。请使用普通路径。');
    result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '"' + tokens.map(t => `"${t}"`).join(' ') + '"'], { stdio: 'inherit', env, windowsVerbatimArguments: true });
  } else result = spawnSync(cmd, argv, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(cmd)} 失败，退出码 ${result.status}`);
}
function executable(name) {
  try { return output(win ? 'where.exe' : '/usr/bin/which', [name]).split(/\r?\n/)[0]; }
  catch { return undefined; }
}
function codeCLI() {
  const candidates = [args.code,
    process.platform === 'darwin' && '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    win && path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
    win && path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft VS Code', 'bin', 'code.cmd'),
    executable(win ? 'code.cmd' : 'code')].filter(Boolean);
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('未找到 VS Code CLI。请安装最新版 VS Code，或用 --code 指定 CLI 路径。');
  return found;
}
function pythonPath() {
  const candidates = win ? [['py', '-3.13'], ['python']] : [['python3.13'], ['python3']];
  for (const [cmd, ...prefix] of candidates) {
    try {
      const info = JSON.parse(output(cmd, [...prefix, '-c', 'import sys,json;print(json.dumps([sys.executable,sys.version_info[:2]]))']));
      if (info[1][0] === 3 && info[1][1] >= 11) return info[0];
    } catch { /* try next installed interpreter */ }
  }
  throw new Error('未找到 Python 3.11+。推荐先安装 Python 3.13，再运行安装脚本。');
}
function resolveRuntimes() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('请使用 Node.js 24 或更新版本。');
  const python = pythonPath();
  let go = executable('go');
  if (process.platform === 'darwin') {
    try {
      const brewGo = path.join(output('brew', ['--prefix', 'go']), 'bin', 'go');
      if (fs.existsSync(brewGo)) go = brewGo;
    } catch { /* existing standalone Go is supported */ }
  }
  if (!go) throw new Error('未找到 Go，请安装 Go 1.27+。');
  const version = output(go, ['version']);
  const parts = /go(\d+)\.(\d+)/.exec(version);
  if (!parts || +parts[1] < 1 || (+parts[1] === 1 && +parts[2] < 27)) throw new Error(`需要 Go 1.27+；当前为 ${version}`);
  return { python, node: process.execPath, go, versions: { python: output(python, ['--version']), node: process.version, go: version } };
}
function shellPlan(runtime) {
  if (process.platform !== 'darwin' || args['skip-shell'] || args['settings-only']) return null;
  // Respect an explicitly configured ZDOTDIR instead of writing the wrong startup file.
  const file = path.join(process.env.ZDOTDIR || home, '.zshrc');
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const dirs = [...new Set([binRoot, path.dirname(runtime.node), path.dirname(runtime.go), path.dirname(runtime.python)])];
  const block = `${shellStart}\nif [[ "$TERM_PROGRAM" == "vscode" ]]; then\n  typeset -U path\n  path=(${dirs.map(quoteSh).join(' ')} $path)\n  export PATH\nfi\n${shellEnd}`;
  const start = before.indexOf(shellStart), end = before.indexOf(shellEnd);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error('.zshrc 中的旧配置标记不完整，请先检查。');
  const after = start >= 0 ? before.slice(0, start) + block + before.slice(end + shellEnd.length) : before + '\n' + block + '\n';
  return { file, before, after };
}

try {
  if (args.restore) {
    const backup = path.resolve(args.restore);
    const receipt = JSON.parse(fs.readFileSync(path.join(backup, 'receipt.json'), 'utf8'));
    const original = read(receipt.settings), restored = restoreSettings(original, receipt.changes);
    console.log(`恢复设置：${receipt.settings}；保留 ${restored.conflicts.length} 项安装后修改`);
    if (!args['dry-run']) {
      if (read(receipt.settings) !== original) throw new Error('设置已被其他程序更改，请重新运行。');
      writeAtomic(receipt.settings, restored.text);
      if (receipt.shell) {
        const current = fs.readFileSync(receipt.shell.file, 'utf8');
        if (current === receipt.shell.after) writeAtomic(receipt.shell.file, receipt.shell.before);
        else console.log('Shell 文件后来有变化，已保留。可手动移除带标记的 VS Code PATH 块。');
      }
    }
    console.log('仅恢复本次管理的设置；已安装扩展和 Go 工具保留。');
  } else {
    const original = read(target);
    parseSettings(original); // fail before installation if existing JSONC is invalid
    const preset = JSON.parse(fs.readFileSync(path.join(root, 'config/settings.json'), 'utf8'));
    const runtime = args['settings-only'] ? null : resolveRuntimes();
    if (runtime) {
      const dirs = [...new Set([binRoot, path.dirname(runtime.node), path.dirname(runtime.go), path.dirname(runtime.python)])];
      const toolPath = dirs.join(path.delimiter) + path.delimiter + '${env:PATH}';
      preset['python.defaultInterpreterPath'] = runtime.python;
      preset['go.alternateTools'] = { go: runtime.go, gopls: path.join(binRoot, 'gopls' + (win ? '.exe' : '')), dlv: path.join(binRoot, 'dlv' + (win ? '.exe' : '')) };
      preset['go.toolsEnvVars'] = { PATH: toolPath };
      preset[`terminal.integrated.env.${win ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'}`] = { PATH: toolPath };
      preset['debug.javascript.defaultRuntimeExecutable'] = { 'pwa-node': runtime.node };
      if (args['skip-go-tools']) {
        delete preset['go.alternateTools'].gopls;
        delete preset['go.alternateTools'].dlv;
      }
      console.log(runtime.versions);
    }
    const plan = mergeSettings(original, preset), shell = runtime ? shellPlan(runtime) : null;
    const cli = args['skip-extensions'] ? null : codeCLI();
    console.log(`设置文件：${target}\n将合并 ${plan.changes.length} 项设置，保留其他设置及注释。`);
    if (args['dry-run']) console.log('预览完成，没有写入设置、安装扩展或下载工具。');
    else {
      // Back up before any mutation. Receipts remain local and may contain private settings.
      const backup = path.join(path.dirname(target), 'vscode-claude-dev', 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
      fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(backup, 'settings.before.jsonc'), original, { mode: 0o600 });
      if (shell) fs.writeFileSync(path.join(backup, 'zshrc.before'), shell.before, { mode: 0o600 });
      if (runtime && !args['skip-go-tools']) {
        fs.mkdirSync(binRoot, { recursive: true });
        const env = { ...process.env, GOBIN: binRoot, PATH: path.dirname(runtime.go) + path.delimiter + process.env.PATH };
        run(runtime.go, ['install', 'golang.org/x/tools/gopls@v0.24.0'], env);
        run(runtime.go, ['install', 'github.com/go-delve/delve/cmd/dlv@v1.27.2'], env);
      }
      if (cli) {
        for (const id of JSON.parse(fs.readFileSync(path.join(root, 'config/extensions.json'), 'utf8'))) run(cli, ['--install-extension', id]);
        run(cli, ['--install-extension', path.join(root, 'dist/paper-writing-1.1.0.vsix'), '--force']);
      }
      if (runtime && !win) {
        fs.mkdirSync(binRoot, { recursive: true });
        for (const name of ['python', 'python3']) {
          const alias = path.join(binRoot, name);
          if (fs.existsSync(alias) || fs.lstatSync(alias, { throwIfNoEntry: false })) {
            if (!fs.lstatSync(alias).isSymbolicLink()) throw new Error(`${alias} 已存在且不是本方案的软链接，未覆盖。`);
            fs.unlinkSync(alias);
          }
          fs.symlinkSync(runtime.python, alias);
        }
      }
      // Never silently overwrite changes made in Settings while downloads were running.
      if (read(target) !== original) throw new Error('安装期间 settings.json 已变化；扩展已安装，设置未覆盖。请重新运行。');
      if (shell && (fs.existsSync(shell.file) ? fs.readFileSync(shell.file, 'utf8') : '') !== shell.before) throw new Error('.zshrc 已变化，设置未覆盖。请重新运行。');
      const receipt = { settings: target, changes: plan.changes, shell, runtime, installedAt: new Date().toISOString() };
      writeAtomic(path.join(backup, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
      writeAtomic(target, plan.text);
      if (shell) writeAtomic(shell.file, shell.after);
      console.log(`完成。备份：${backup}\n请重新加载 VS Code 并新建终端。Codex 在新机器上需单独登录。`);
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
