const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
function harness(layout = { orientation: 0, groups: [{ size: .4 }, { size: .6 }] }) {
  const commands = {}, calls = [];
  const api = { commands: {
    registerCommand(id, fn) { commands[id] = fn; return {}; },
    async executeCommand(id, ...args) { calls.push([id, ...args]); if (id === 'vscode.getEditorLayout') return layout; }
  }, window: { showErrorMessage(message) { throw Error(message); } } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extensions/paper-writing/diagram-fullscreen.js'), 'utf8'), { module, require: () => api });
  module.exports.registerDiagramFullscreen({ subscriptions: [] });
  return { calls, layout, invoke: name => commands[`paperWriting.${name}`]() };
}
test('whole-screen diagram preserves group layout and enters then exits OS fullscreen', async () => {
  const h = harness();
  await h.invoke('enterDiagramFullscreen'); await h.invoke('enterDiagramFullscreen');
  assert.equal(h.calls.filter(c => c[0] === 'workbench.action.toggleMaximizeEditorGroup').length, 1);
  assert.equal(h.calls.filter(c => c[0] === 'workbench.action.toggleFullScreen').length, 1);
  await h.invoke('exitDiagramFullscreen');
  assert.equal(h.calls.filter(c => c[0] === 'vscode.setEditorLayout').at(-1)[1], h.layout);
  assert.equal(h.calls.filter(c => c[0] === 'workbench.action.toggleFullScreen').length, 2);
  assert.equal(h.calls.at(-1)[2], false);
});
test('an already fullscreen window stays fullscreen after restoring split reading', async () => {
  const h = harness(); await h.invoke('expandDiagram'); await h.invoke('exitDiagramFullscreen');
  assert.equal(h.calls.filter(c => c[0] === 'workbench.action.toggleFullScreen').length, 0);
});
test('manual OS fullscreen exit is respected, and a single group needs no maximize toggle', async () => {
  const h = harness({ orientation: 0, groups: [{ size: 1 }] });
  await h.invoke('enterDiagramFullscreen'); await h.invoke('exitDiagramFocus');
  assert.equal(h.calls.filter(c => c[0] === 'workbench.action.toggleFullScreen').length, 1);
  assert.equal(h.calls.filter(c => c[0] === 'workbench.action.toggleMaximizeEditorGroup').length, 0);
});
