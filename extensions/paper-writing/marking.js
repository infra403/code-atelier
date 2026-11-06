'use strict';
const PALETTES = Object.freeze({
  color: [
    { id: 'terracotta', label: '陶土橙', value: '#a14e32' },
    { id: 'sage', label: '松叶绿', value: '#42654a' },
    { id: 'blue', label: '墨水蓝', value: '#365f82' },
    { id: 'plum', label: '烟紫', value: '#72517b' },
    { id: 'rose', label: '酒红', value: '#963e55' },
    { id: 'graphite', label: '石墨灰', value: '#54534c' }
  ],
  highlight: [
    { id: 'yellow', label: '奶油黄', value: '#f4e5b4' },
    { id: 'peach', label: '杏桃橙', value: '#f6e2d2' },
    { id: 'sage', label: '鼠尾草绿', value: '#e3ecd9' },
    { id: 'blue', label: '雾蓝', value: '#e0ecf4' },
    { id: 'lavender', label: '淡薰衣草', value: '#ebe3f4' },
    { id: 'rose', label: '玫瑰粉', value: '#f6e2e8' }
  ]
});
const MARKS = Object.freeze({
  color: { open: '<span style="color:#a14e32">', close: '</span>' },
  highlight: { open: '<mark style="background-color:#f4e5b4;color:inherit">', close: '</mark>' },
  bold: { open: '**', close: '**' },
  italic: { open: '*', close: '*' },
  underline: { open: '<u>', close: '</u>' },
  strike: { open: '~~', close: '~~' }
});
function openingAtStart(text) {
  let match = text.match(/^<span style="color:(#[a-f\d]{6})">/i);
  if (match) return { kind: 'color', open: match[0], close: '</span>', value: match[1] };
  match = text.match(/^<mark style="background-color:(#[a-f\d]{6});color:inherit">/i);
  if (match) return { kind: 'highlight', open: match[0], close: '</mark>', value: match[1] };
  for (const kind of ['underline', 'bold', 'strike', 'italic']) {
    if (text.startsWith(MARKS[kind].open)) return { kind, ...MARKS[kind] };
  }
}
// Only peel a complete envelope, never two neighbouring formatted fragments.
function isEnvelope(text, layer) {
  if (!text.endsWith(layer.close) || text.length < layer.open.length + layer.close.length) return false;
  if (!layer.open.startsWith('<')) {
    const inner = text.slice(layer.open.length, -layer.close.length);
    return !inner.includes(layer.close);
  }
  const tag = layer.open.match(/^<(\w+)/)[1];
  const tokens = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'g');
  let depth = 0;
  for (const match of text.matchAll(tokens)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return match.index + match[0].length === text.length;
  }
  return false;
}
function getEnvelope(text, start, end) {
  let content = text.slice(start, end);
  const layers = [];
  for (;;) {
    const layer = openingAtStart(content);
    if (!layer || !isEnvelope(content, layer)) break;
    layers.push(layer);
    content = content.slice(layer.open.length, -layer.close.length);
  }
  for (;;) {
    const before = text.slice(0, start);
    const candidates = [
      before.match(/<span style="color:#[a-f\d]{6}">$/i)?.[0],
      before.match(/<mark style="background-color:#[a-f\d]{6};color:inherit">$/i)?.[0],
      ...['underline', 'bold', 'strike', 'italic'].map(kind => MARKS[kind].open)
    ].filter(Boolean);
    const open = candidates.find(token => before.endsWith(token) && text.slice(end).startsWith(openingAtStart(token).close));
    if (!open) break;
    const layer = openingAtStart(open);
    start -= layer.open.length;
    end += layer.close.length;
    layers.unshift(layer);
  }
  return { start, end, content, layers };
}
// One atomic edit. Offsets are UTF-16, like VS Code. An explicit palette
// choice replaces that family; default mode retains the original toggle API.
function planMark(text, ranges, kind, options = {}) {
  const mark = MARKS[kind];
  if (!mark) throw new Error('未知标记类型。');
  const mode = options.mode || 'toggle';
  if (!['set', 'toggle', 'remove'].includes(mode)) throw new Error('未知标记操作。');
  const value = options.value || PALETTES[kind]?.[0].value;
  if (value && !PALETTES[kind]?.some(item => item.value === value)) throw new Error('请从色板中选择颜色。');
  if (!ranges.length) throw new Error('请先在左侧选中要标记的文字。');
  const edits = ranges.map(({ start, end, reversed = false }, index) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start >= end) {
      throw new Error('请先在左侧选中要标记的文字。');
    }
    if (/[\r\n]/.test(text.slice(start, end))) {
      throw new Error('请逐段标记：每次选择同一源代码行中的文字，屏幕上的自动换行不受影响。');
    }
    const envelope = getEnvelope(text, start, end);
    const existing = envelope.layers.some(layer => layer.kind === kind && (!value || layer.value?.toLowerCase() === value));
    const layers = envelope.layers.filter(layer => layer.kind !== kind);
    if (mode !== 'remove' && !(mode === 'toggle' && existing)) {
      const next = { kind, ...mark };
      if (kind === 'color') next.open = `<span style="color:${value}">`;
      if (kind === 'highlight') next.open = `<mark style="background-color:${value};color:inherit">`;
      const oldIndex = envelope.layers.findIndex(layer => layer.kind === kind);
      layers.splice(oldIndex < 0 ? 0 : Math.min(oldIndex, layers.length), 0, next);
    }
    const prefix = layers.map(layer => layer.open).join('');
    const suffix = [...layers].reverse().map(layer => layer.close).join('');
    return { start: envelope.start, end: envelope.end, replacement: prefix + envelope.content + suffix,
      innerOffset: prefix.length, innerLength: envelope.content.length, index, reversed };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].start < edits[i - 1].end) throw new Error('选区重叠，请分别标记。');
  }
  let delta = 0;
  const selections = [];
  for (const edit of edits) {
    const start = edit.start + delta + edit.innerOffset;
    selections[edit.index] = { start, end: start + edit.innerLength, reversed: edit.reversed };
    delta += edit.replacement.length - (edit.end - edit.start);
  }
  return { edits, selections };
}
module.exports = { MARKS, PALETTES, planMark };
