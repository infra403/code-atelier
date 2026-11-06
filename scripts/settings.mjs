import fs from 'node:fs';
import path from 'node:path';
import { parse, modify, applyEdits, printParseErrorCode } from 'jsonc-parser';

export function parseSettings(text) {
  const errors = [];
  const value = parse(text.trim() ? text.replace(/^\uFEFF/, '') : '{}', errors, { allowTrailingComma: true });
  if (errors.length || !value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`settings.json 无效，未修改：${errors.map(e => printParseErrorCode(e.error)).join(', ')}`);
  }
  return value;
}

export function leaves(obj, prefix = []) {
  return Object.entries(obj).flatMap(([key, value]) => {
    const p = [...prefix, key];
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length
      ? leaves(value, p) : [{ path: p, value }];
  });
}
export function getAt(obj, parts) {
  for (const part of parts) obj = obj?.[part];
  return obj;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function replace(text, parts, value) {
  return applyEdits(text, modify(parts.length ? text : '{}', parts, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' }
  }));
}

export function mergeSettings(original, preset) {
  let text = original.trim() ? original.replace(/^\uFEFF/, '') : '{}\n';
  const before = parseSettings(text), changes = [];
  for (const item of leaves(preset)) {
    const old = getAt(before, item.path);
    // Reinstalling must keep the colors the user selected after initial setup.
    if (['paperWriting.textColor', 'paperWriting.highlightColor'].includes(item.path[0]) && old !== undefined) continue;
    if (same(old, item.value)) continue;
    changes.push({ path: item.path, existed: old !== undefined, before: old, after: item.value });
    text = replace(text, item.path, item.value);
  }
  return { text, changes };
}

export function restoreSettings(original, changes) {
  let text = original;
  const current = parseSettings(text), conflicts = [];
  for (const change of [...changes].reverse()) {
    if (!same(getAt(current, change.path), change.after)) {
      conflicts.push(change.path.join(' > '));
      continue;
    }
    text = replace(text, change.path, change.existed ? change.before : undefined);
  }
  return { text, conflicts };
}

export function settingsPath(platform, home, env = process.env) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  if (platform === 'win32') return path.win32.join(env.APPDATA || path.win32.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Code', 'User', 'settings.json');
}

export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, text, { mode: 0o600 }); fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
