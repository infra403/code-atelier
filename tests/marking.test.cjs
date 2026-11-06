const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planMark } = require('../extensions/paper-writing/marking');
function apply(text, plan) {
  for (const edit of [...plan.edits].reverse()) text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  return text;
}
test('Chinese, emoji and unrelated manuscript content survive apply/remove', () => {
  const original = '# 标题\n\n前文🙂客户研究，后文与 [链接](./书稿.md)。\n';
  const start = original.indexOf('客户研究');
  const first = planMark(original, [{ start, end: start + 4 }], 'color');
  const marked = apply(original, first);
  assert.equal(marked, '# 标题\n\n前文🙂<span style="color:#a14e32">客户研究</span>，后文与 [链接](./书稿.md)。\n');
  assert.equal(marked.slice(first.selections[0].start, first.selections[0].end), '客户研究');
  assert.equal(apply(marked, planMark(marked, first.selections, 'color')), original);
});
test('highlight and color can be combined and removed independently', () => {
  const original = '前 **重点** 后';
  const color = planMark(original, [{start: 2, end: 8}], 'color');
  const colored = apply(original, color);
  const highlight = planMark(colored, color.selections, 'highlight');
  const both = apply(colored, highlight);
  assert.ok(both.includes('color:inherit'));
  assert.ok(both.includes('**重点**'));
  assert.equal(apply(both, planMark(both, highlight.selections, 'highlight')), colored);
});
test('multi-cursor ranges keep their original ordering and direction', () => {
  const original = '一🙂二，三四';
  const first = planMark(original, [{ start: 5, end: 7, reversed: true }, { start: 0, end: 4 }], 'highlight');
  const marked = apply(original, first);
  assert.equal(marked.slice(first.selections[0].start, first.selections[0].end), '三四');
  assert.equal(first.selections[0].reversed, true);
  assert.equal(apply(marked, planMark(marked, first.selections, 'highlight')), original);
});
test('selecting an entire generated tag removes it without touching adjacent content', () => {
  const original = '前<span style="color:#a14e32">正文</span>后';
  assert.equal(apply(original, planMark(original, [{start: 1, end: original.length - 1}], 'color')), '前正文后');
});
test('empty, multiline, invalid and overlapping ranges cannot damage a manuscript', () => {
  assert.throws(() => planMark('abc', [], 'color'));
  assert.throws(() => planMark('abc', [{start: 1, end: 1}], 'color'));
  assert.throws(() => planMark('abc', [{start: 0, end: 4}], 'color'));
  assert.throws(() => planMark('第一段\n\n第二段', [{start: 0, end: 8}], 'highlight'));
  assert.throws(() => planMark('abc', [{start: 0, end: 2}, {start: 1, end: 3}], 'color'));
});
test('every palette choice switches without accumulating same-family tags', () => {
  const { PALETTES } = require('../extensions/paper-writing/marking');
  for (const kind of ['color', 'highlight']) {
    let text = '前客户研究后', ranges = [{start: 1, end: 5}];
    for (const choice of PALETTES[kind]) {
      const plan = planMark(text, ranges, kind, {mode:'set',value:choice.value});
      text = apply(text, plan); ranges = plan.selections;
      assert.equal((text.match(kind === 'color' ? /<span/g : /<mark/g)||[]).length, 1);
      assert.ok(text.includes(choice.value));
      assert.equal(text.slice(ranges[0].start,ranges[0].end),'客户研究');
    }
    assert.equal(apply(text, planMark(text,ranges,kind,{mode:'remove'})), '前客户研究后');
  }
});
test('all marks can be combined, recolored and independently removed', () => {
  let text = '前🙂重点后', ranges = [{start: 3,end:5}];
  for (const kind of ['bold','italic','underline','strike','color','highlight']) {
    const plan = planMark(text,ranges,kind); text = apply(text,plan); ranges=plan.selections;
  }
  const plan = planMark(text,ranges,'color',{mode:'set',value:'#365f82'});
  text=apply(text,plan);ranges=plan.selections;
  assert.ok(text.includes('#365f82'));assert.ok(!text.includes('#a14e32'));
  for (const kind of ['bold','underline','highlight','italic','color','strike']) {
    const plan=planMark(text,ranges,kind,{mode:'remove'});text=apply(text,plan);ranges=plan.selections;
  }
  assert.equal(text,'前🙂重点后');
});
test('selecting whole nested markup switches one family and preserves the others', () => {
  const original='<span style="color:#a14e32"><mark style="background-color:#f4e5b4;color:inherit">**重点**</mark></span>';
  const plan=planMark(original,[{start:0,end:original.length}],'color',{mode:'set',value:'#42654a'});
  assert.equal(apply(original,plan),original.replace('#a14e32','#42654a'));
});
test('plain removal is a no-op, adjacent tags are not incorrectly peeled', () => {
  assert.equal(apply('正文',planMark('正文',[{start:0,end:2}],'color',{mode:'remove'})),'正文');
  const original='<span style="color:#a14e32">甲</span><span style="color:#365f82">乙</span>';
  const plan=planMark(original,[{start:0,end:original.length}],'highlight',{mode:'set'});
  assert.ok(apply(original,plan).includes(original));
});
test('text palette meets contrast on paper and every highlight background', () => {
  const {PALETTES}=require('../extensions/paper-writing/marking');
  const luminance=hex=>{
    const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  for(const color of PALETTES.color)for(const bg of ['#faf9f5',...PALETTES.highlight.map(c=>c.value)]) {
    const ratio=(luminance(bg)+.05)/(luminance(color.value)+.05);
    assert.ok(ratio>=4.5,`${color.label} on ${bg}: ${ratio}`);
  }
});
