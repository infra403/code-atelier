'use strict';
const vscode = require('vscode');
const { planMark, PALETTES } = require('./marking');
function activate(context) {
  const busy = new Set();
  const configKeys = { color: 'textColor', highlight: 'highlightColor' };
  function configuredColor(kind) {
    const id = vscode.workspace.getConfiguration('paperWriting').get(configKeys[kind]);
    return PALETTES[kind].find(item => item.id === id) || PALETTES[kind][0];
  }
  async function configurePalette() {
    const items = [];
    for (const kind of ['color', 'highlight']) {
      const current = configuredColor(kind);
      items.push({ label: kind === 'color' ? '文字颜色 · A 按钮' : '荧光笔颜色', kind: vscode.QuickPickItemKind.Separator });
      for (const item of PALETTES[kind]) items.push({
        label: item.label, description: item.id === current.id ? '✓ 当前使用' : '',
        iconPath: vscode.Uri.joinPath(context.extensionUri, 'icons', `${kind}-${item.id}.svg`),
        family: kind, colorId: item.id
      });
    }
    const chosen = await vscode.window.showQuickPick(items, {
      title: '配色设置 · 选一次，之后一点标记',
      placeHolder: '选择文字色或荧光笔色 · 设置会保留', ignoreFocusOut: false
    });
    if (!chosen) return;
    await vscode.workspace.getConfiguration('paperWriting').update(configKeys[chosen.family], chosen.colorId, vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage(`${chosen.family === 'color' ? '文字颜色' : '荧光笔'}已设为${chosen.label}`, 3500);
  }
  async function format(kind, resource) {
    let editor = vscode.window.activeTextEditor;
    if (resource instanceof vscode.Uri && editor?.document.uri.toString() !== resource.toString()) {
      editor = vscode.window.visibleTextEditors.find(item => item.document.uri.toString() === resource.toString());
    }
    if (!editor || editor.document.languageId !== 'markdown') {
      return vscode.window.showInformationMessage('请先在左侧 Markdown 编辑区选中文字。');
    }
    const document = editor.document, key = document.uri.toString();
    if (busy.has(key)) return;
    busy.add(key);
    try {
      // Capture before opening the palette: clicking it must not lose selection.
      const version = document.version, original = document.getText();
      const ranges = editor.selections.map(selection => ({
        start: document.offsetAt(selection.start), end: document.offsetAt(selection.end), reversed: selection.isReversed
      }));
      planMark(original, ranges, kind === 'more' ? 'bold' : kind);
      let options = {};
      if (PALETTES[kind]) {
        options = { mode: 'toggle', value: configuredColor(kind).value };
      } else if (kind === 'more') {
        const chosen = await vscode.window.showQuickPick([
          { label: '$(italic) 斜体', markKind: 'italic', description: '再次点击取消' },
          { label: '下划线', markKind: 'underline', description: '再次点击取消' },
          { label: '$(strikethrough) 删除线', markKind: 'strike', description: '再次点击取消' },
          { label: '清除颜色', kind: vscode.QuickPickItemKind.Separator },
          { label: '$(clear-all) 恢复默认文字色', markKind: 'color', mode: 'remove' },
          { label: '$(clear-all) 清除高亮', markKind: 'highlight', mode: 'remove' }
        ], { title: '更多文字标记', placeHolder: '为选中文字添加标记', ignoreFocusOut: false });
        if (!chosen) return;
        kind = chosen.markKind;
        if (chosen.mode) options = { mode: chosen.mode };
      }
      if (document.isClosed || document.version !== version || !vscode.window.visibleTextEditors.includes(editor)) {
        return vscode.window.showInformationMessage('文档已变化，请重新选择文字后再试。');
      }
      const plan = planMark(original, ranges, kind, options);
      const applied = await editor.edit(builder => {
        for (const edit of plan.edits) builder.replace(new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)), edit.replacement);
      }, { undoStopBefore: true, undoStopAfter: true });
      if (!applied) return vscode.window.showInformationMessage('文档已变化或不可编辑，请重新选择文字后再试。');
      editor.selections = plan.selections.map(selection => {
        const start = document.positionAt(selection.start), end = document.positionAt(selection.end);
        return selection.reversed ? new vscode.Selection(end, start) : new vscode.Selection(start, end);
      });

    } catch (error) {
      vscode.window.showInformationMessage(error instanceof Error ? error.message : '标记未完成，请重新选择文字。');
    } finally { busy.delete(key); }
  }
  // Menu variants share the same action; VS Code selects the visible title/icon
  // from config.* context keys, including changes made in Settings.
  for (const [kind, colors] of Object.entries(PALETTES)) {
    for (const color of colors) {
      context.subscriptions.push(vscode.commands.registerCommand(`paperWriting.${kind}.${color.id}`, resource => format(kind, resource)));
    }
  }
  context.subscriptions.push(vscode.commands.registerCommand('paperWriting.paletteSettings', configurePalette));
  for (const [command, kind] of Object.entries({ toggleColor: 'color', toggleHighlight: 'highlight', toggleBold: 'bold', moreMarks: 'more' })) {
    context.subscriptions.push(vscode.commands.registerCommand(`paperWriting.${command}`, resource => format(kind, resource)));
  }
  require('./diagram-fullscreen').registerDiagramFullscreen(context);
  const navigation = require('./navigation').registerNavigation(context);
  const standalone = require('./standalone-viewer').registerStandaloneViewer(context);
  return { extendMarkdownIt(md) { return standalone.extendMarkdownIt(navigation.extendMarkdownIt(md)); } };
}
module.exports = { activate };
