'use strict';
const vscode = require('vscode');

// Fullscreen belongs to the workbench, not the sandboxed Markdown webview.
// Menu/keybinding contexts tell us whether the OS window is already fullscreen.
function registerDiagramFullscreen(context) {
  let saved = null, busy = false;
  const run = (id, ...args) => vscode.commands.executeCommand(id, ...args);
  const countGroups = layout => layout.groups.reduce((sum, group) => sum + (group.groups ? countGroups(group) : 1), 0);
  async function enter(alreadyFullscreen) {
    if (saved || busy) return;
    busy = true;
    try {
      const layout = await run('vscode.getEditorLayout');
      saved = { layout, enteredFullscreen: false };
      // Reapply without merging any groups, clearing a pre-existing maximized state.
      await run('vscode.setEditorLayout', layout);
      if (countGroups(layout) > 1) await run('workbench.action.toggleMaximizeEditorGroup');
      if (!alreadyFullscreen) {
        await run('workbench.action.toggleFullScreen');
        saved.enteredFullscreen = true;
      }
      await run('setContext', 'paperWriting.diagramFullscreen', true);
    } catch (error) {
      if (saved) await run('vscode.setEditorLayout', saved.layout);
      saved = null;
      vscode.window.showErrorMessage(`全屏看图：${error.message}`);
    } finally { busy = false; }
  }
  async function exit(currentlyFullscreen) {
    if (!saved || busy) return;
    busy = true;
    const previous = saved;
    try {
      await run('vscode.setEditorLayout', previous.layout);
      // If the user already exited via the OS, do not accidentally enter again.
      if (previous.enteredFullscreen && currentlyFullscreen) await run('workbench.action.toggleFullScreen');
      saved = null;
      await run('setContext', 'paperWriting.diagramFullscreen', false);
    } catch (error) {
      vscode.window.showErrorMessage(`退出全屏看图：${error.message}`);
    } finally { busy = false; }
  }
  const actions = {
    enterDiagramFullscreen: () => enter(false), expandDiagram: () => enter(true),
    exitDiagramFullscreen: () => exit(true), exitDiagramFocus: () => exit(false)
  };
  for (const [id, action] of Object.entries(actions)) context.subscriptions.push(vscode.commands.registerCommand(`paperWriting.${id}`, action));
}
module.exports = { registerDiagramFullscreen };
