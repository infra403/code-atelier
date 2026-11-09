const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildBook,findBookRoot,neighbour,navHTML,localDestination}=require('../extensions/paper-writing/book-index');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'paper-books-'));const write=(file,text)=>{const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);return p;};try{fn(root,write);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('table of contents crosses nested volumes in authored order, deduplicating links',()=>fixture((root,write)=>{
  write('README.md','# 合集\n[第二册](manuscript/B/README.md)\n[第一册](manuscript/A/README.md)\n[重复](manuscript/B/02.md)');
  write('manuscript/B/README.md','# 第二册\n[二](02.md)\n[十](10.md)\n[代码](code/tool.md)\n[审校](editorial_review_log.md)');
  write('manuscript/A/README.md','# 第一册\n[一](01.md)');
  const one=write('manuscript/B/02.md','# 第二章'),two=write('manuscript/B/10.md','# 第十章'),three=write('manuscript/A/01.md','# 第一章');
  write('manuscript/B/code/tool.md','# Tool');write('manuscript/B/editorial_review_log.md','# Review');write('manuscript/A/unlisted.md','# 未列入目录');
  const book=buildBook(root);assert.deepEqual(book.chapters.map(c=>c.file),[one,two,three]);
  assert.equal(neighbour(book,two,1).file,three);assert.equal(neighbour(book,three,1),undefined);assert.equal(neighbour(book,one,-1),undefined);
  assert.equal(neighbour(book,path.join(root,'README.md'),1).file,one);
}));
test('contents takes precedence, handles encoded Chinese paths, reference links and missing entries',()=>fixture((root,write)=>{
  write('README.md','# 书名\n[别的](other.md)');write('other.md','# 不在正文章节中');
  write('CONTENTS.md','# 目录\n[返回说明](README.md)\n[中文](chapters/%E4%B8%AD%E6%96%87%20%23%E7%AB%A0.md)\n[下一章][next]\n[next]: chapters/two.md\n[缺失](missing.md)\n[外部](https://example.com/x.md)');
  const first=write('chapters/中文 #章.md','# 第一章'),second=write('chapters/two.md','# 第二章');
  assert.deepEqual(buildBook(root).chapters.map(c=>c.file),[first,second]);
}));
test('fallback natural sorting skips code and evidence and keeps numeric order',()=>fixture((root,write)=>{
  const two=write('chapters/2.md','# 二'),ten=write('chapters/10.md','# 十');
  write('code/1.md','# code');write('evidence/a.md','# evidence');write('chapters/00_来源与章节对应及审校记录.md','# 辅助');
  assert.deepEqual(buildBook(root).chapters.map(c=>c.file),[two,ten]);
}));
test('explicit book boundary contains nested files and ignores other workspaces',()=>fixture((library,write)=>{
  const file=write('book/manuscript/volume/01.md','# 正文');write('book/README.md','# 书');
  assert.equal(findBookRoot(file,[library],[]),path.join(library,'book'));
  assert.equal(findBookRoot(path.join(os.tmpdir(),'outside.md'),[library],[os.tmpdir()]),null);
}));
test('links cannot escape the book, include external schemes, or follow outside symlinks',()=>fixture((root,write)=>{
  const readme=write('README.md','# 书'),valid=write('chapters/a.md','# 安全');
  for(const href of ['../../outside.md','file:///tmp/a.md','command:workbench.action.closeWindow','https://example.com/a.md','%00.md'])assert.equal(localDestination(root,readme,href),null);
  assert.equal(localDestination(root,readme,'chapters/a.md'),valid);
  if(process.platform!=='win32'){fs.symlinkSync(os.tmpdir(),path.join(root,'external'));assert.equal(localDestination(root,readme,'external/outside.md'),null);}
}));
test('navigation markup escapes titles and supplies local hrefs without altering chapters',()=>fixture((root,write)=>{
  write('README.md','# 书\n[一](一.md)\n[二](二.md)');
  const first=write('一.md','# <img src=x onerror=evil()>'),second=write('二.md','# 二');
  const book=buildBook(root),original=fs.readFileSync(first,'utf8');
  const html=navHTML(book,first).top;
  assert.match(html,/aria-current="page"/);assert.match(html,/data-href="%E4%BA%8C.md"/);assert.doesNotMatch(html,/<img/);
  assert.equal(fs.readFileSync(first,'utf8'),original);assert.ok(neighbour(book,first,1).file===second);
}));
