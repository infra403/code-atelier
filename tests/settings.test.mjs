import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSettings, mergeSettings, restoreSettings, settingsPath } from '../scripts/settings.mjs';

test('JSONC merge preserves comments, unrelated settings and nested configuration', () => {
  const before = '{\n // Keep this comment\n "custom.setting": "https://host/a,//b",\n "[python]": { "editor.rulers": [88], },\n "paperWriting.textColor": "blue",\n}\n';
  const plan = mergeSettings(before, { '[python]': { 'editor.formatOnSave': true }, 'paperWriting.textColor': 'terracotta' });
  assert.match(plan.text, /Keep this comment/);
  assert.deepEqual(parseSettings(plan.text), { 'custom.setting': 'https://host/a,//b', '[python]': { 'editor.rulers': [88], 'editor.formatOnSave': true }, 'paperWriting.textColor': 'blue' });
  assert.equal(mergeSettings(plan.text, { '[python]': { 'editor.formatOnSave': true } }).changes.length, 0);
});
test('invalid or non-object settings fail closed', () => {
  for (const text of ['{"broken": }', '[]', 'null', '{"x":1, "x2":}']) assert.throws(() => mergeSettings(text, { a: 1 }));
});
test('restore removes only managed values and preserves later user changes', () => {
  const initial = '{"[python]":{"editor.tabSize":8}, "unrelated":42}';
  const plan = mergeSettings(initial, { '[python]': { 'editor.tabSize': 4, 'editor.formatOnSave': true }, 'new.setting': 'a' });
  assert.deepEqual(parseSettings(restoreSettings(plan.text, plan.changes).text), parseSettings(initial));
  const later = plan.text.replace('"new.setting": "a"', '"new.setting": "b"');
  const restored = restoreSettings(later, plan.changes);
  assert.equal(parseSettings(restored.text)['new.setting'], 'b');
  assert.equal(restored.conflicts.length, 1);
});
test('settings paths are generated for each machine and Windows roaming directory', () => {
  assert.equal(settingsPath('darwin', '/Users/demo'), '/Users/demo/Library/Application Support/Code/User/settings.json');
  assert.equal(settingsPath('win32', 'C:\\Users\\Demo', {APPDATA:'D:\\Roaming'}), 'D:\\Roaming\\Code\\User\\settings.json');
});
test('installer dry run, backup, repeat and restore work without touching actual VS Code', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-setup-'));
  try {
    const target = path.join(tmp, 'User', 'settings.json');
    const script = fileURLToPath(new URL('../scripts/setup.mjs', import.meta.url));
    const argv = [script, '--settings', target, '--settings-only', '--skip-extensions'];
    execFileSync(process.execPath, [...argv, '--dry-run']);
    assert.equal(fs.existsSync(target), false);
    const log = execFileSync(process.execPath, argv, {encoding:'utf8'});
    assert.match(log, /完成/);
    const first = fs.readFileSync(target, 'utf8');
    assert.equal(parseSettings(first)['workbench.colorTheme'], '纸页 · Claude');
    execFileSync(process.execPath, argv);
    assert.equal(fs.readFileSync(target, 'utf8'), first);
    const backups = path.join(tmp, 'User', 'vscode-claude-dev', 'backups');
    const receiptDir = fs.readdirSync(backups).sort()[0];
    const receipt = JSON.parse(fs.readFileSync(path.join(backups, receiptDir, 'receipt.json')));
    assert.ok(receipt.changes.length > 0);
    execFileSync(process.execPath, [script, '--restore', path.join(backups, receiptDir)]);
    const restored = parseSettings(fs.readFileSync(target, 'utf8'));
    assert.equal(restored['workbench.colorTheme'], undefined);
    assert.equal(restored['[python]']?.['editor.formatOnSave'], undefined);
  } finally { fs.rmSync(tmp, {recursive:true,force:true}); }
});
test('extension CLI invocation supports an installation path with spaces', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cli-'));
  try {
    const cli = path.join(tmp, process.platform === 'win32' ? 'fake code.cmd' : 'fake code');
    const log = path.join(tmp, 'calls.txt');
    const body = process.platform === 'win32'
      ? `@echo off\r\necho %*>>"${log}"\r\nexit /b 0\r\n`
      : `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n`;
    fs.writeFileSync(cli, body, {mode:0o700});
    const script = fileURLToPath(new URL('../scripts/setup.mjs', import.meta.url));
    execFileSync(process.execPath, [script,'--settings',path.join(tmp,'settings.json'),'--settings-only','--code',cli]);
    const calls = fs.readFileSync(log,'utf8').replaceAll('"','');
    assert.match(calls, /--install-extension openai.chatgpt/);
    assert.match(calls, /paper-writing-1.2.3.vsix/);
    assert.equal(calls.trim().split(/\r?\n/).length, 13);
  } finally { fs.rmSync(tmp, {recursive:true,force:true}); }
});
