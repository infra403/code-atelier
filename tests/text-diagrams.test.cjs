const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extendTextDiagrams } = require('../extensions/paper-writing/text-diagrams');

const comparison = [
  '┌── 路径对比 ──┐', '│ 路径 A │', '│ [收 \\$19/月] ──► [缓存] │', '│ ▲ 甲   ▲ 乙 │',
  '├──────────┤', '│ 路径 B │', '│ [<draft>] ─► [确认] │', '│ ▲ 丙   ▲ 丁 │', '└──────────┘'
].join('\n');
function render(source, info = 'text') {
  const md = { renderer: { rules: { fence: () => '<pre>native</pre>' } },
    utils: { escapeHtml: text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') } };
  const token = { content: source, info };
  return extendTextDiagrams(md).renderer.rules.fence([token], 0, {}, {}, { renderAttrs: () => ' class="code-line" data-line="23"' });
}
test('paired steps keep their annotations, source map and literal original', () => {
  const html = render(comparison);
  assert.match(html, /class="code-line" data-line="23"><figure/);
  assert.ok(html.includes('<strong>收 $19/月</strong><span>甲</span>'));
  assert.ok(html.includes('<strong>&lt;draft&gt;</strong><span>丙</span>'));
  assert.ok(!html.includes('<draft>'));
  assert.ok(html.includes('<pre><code>' + comparison.replaceAll('<draft>', '&lt;draft&gt;')));
  assert.equal((html.match(/<li>/g) || []).length, 4);
});
test('unpaired or more complex drawings use the intact native fence', () => {
  for (const source of [comparison.replace('▲ 丙   ▲ 丁', '▲ 丁'), comparison.replace('[确认]', '[确认]\n│ 新增一行 │'), '+----+\n| ok |\n+----+']) {
    assert.equal(render(source), '<div class="paper-text-diagram"><pre>native</pre></div>\n');
  }
});
test('prose and other fence languages still use the native renderer', () => {
  for (const lang of ['mermaid', 'diff', 'js']) assert.equal(render(comparison, lang), '<pre>native</pre>');
  assert.equal(render('some plain text'), '<pre>native</pre>');
});

const card = [
  '┌─────────────────┐', '│ Project checklist │', '├────┬────────────┤',
  '│ Dimension │ Threshold │', '├────┼────────────┤',
  '│ 1. Cost │ API < 10% │', '│ (A & B) │ margin >= 75% │', '├────┼────────────┤',
  '│ 2. Review │ □ One │', '│           │ □ Two │', '└────┴────────────┘'
].join('\n');
test('box table groups wrapped cells by divider, escapes literals and preserves exact source', () => {
  const html = render(card);
  assert.ok(html.includes('<caption>Project checklist</caption>'));
  assert.ok(html.includes('<th scope="col">Threshold</th>'));
  assert.ok(html.includes('1. Cost<br>(A &amp; B)</th>'));
  assert.ok(html.includes('API &lt; 10%\nmargin &gt;= 75%</td>'));
  assert.ok(html.includes('□ One<br>□ Two</td>'));
  assert.equal((html.match(/scope="row"/g) || []).length, 2);
  assert.ok(html.includes('<pre><code>' + card.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')));
});
test('untitled and three-column grids retain header and cell boundaries', () => {
  const source = '┌──┬──┬──┐\r\n│ A │ B │ C │\r\n├──┼──┼──┤\r\n│ 1 │   │ <2> │\r\n└──┴──┴──┘';
  const html = render(source, '');
  assert.ok(!html.includes('<caption>'));
  assert.equal((html.match(/scope="col"/g) || []).length, 3);
  assert.ok(html.includes('aria-hidden="true">B</span></td>'));
  assert.ok(html.includes('&lt;2&gt;</td>'));
});
test('irregular grids fall back as a whole without dropping any content', () => {
  for (const malformed of [
    card.replace('├────┼────────────┤','├────┼──┼──┤'), card.replace('│ Dimension │ Threshold │','│ merged heading │'),
    card.replace('│ 2. Review │ □ One │','extra line'), card.replace('└────┴────────────┘','└────────────┘')
  ]) assert.equal(render(malformed), '<div class="paper-text-diagram"><pre>native</pre></div>\n');
});
