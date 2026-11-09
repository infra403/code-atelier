import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('portable presets have no original machine paths or credential fields', () => {
  const text = fs.readFileSync(path.join(root,'config/settings.json'),'utf8');
  assert.doesNotMatch(text, /\/Users\/|\/Volumes\/|[A-Z]:\\\\Users\\\\|api.?key|access.?token|password/i);
  const config = JSON.parse(text);
  assert.equal(config['workbench.colorTheme'], '纸页 · Claude');
  assert.equal(config['paperWriting.highlightColor'], 'yellow');
  assert.equal(config['chatgpt.localeOverride'], 'zh-CN');
  assert.equal(config['python.defaultInterpreterPath'], undefined);
});
test('theme, preview and current-color commands are bundled in local extension', () => {
  const extension = path.join(root,'extensions/paper-writing');
  const manifest = JSON.parse(fs.readFileSync(path.join(extension,'package.json'),'utf8'));
  assert.ok(manifest.contributes.themes.some(t => t.label === '纸页 · Claude'));
  for(const theme of manifest.contributes.themes) assert.ok(fs.existsSync(path.join(extension,theme.path)));
  for(const style of manifest.contributes['markdown.previewStyles']) assert.ok(fs.existsSync(path.join(extension,style)));
  assert.ok(manifest.contributes.commands.some(c=>c.command==='paperWriting.paletteSettings'));
  assert.ok(fs.existsSync(path.join(root,'dist/paper-writing-1.2.0.vsix')));
});
