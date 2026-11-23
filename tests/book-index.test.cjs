const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildBook,buildCollection,collectionEntry,findBookRoot,shelf,discoverBooks,clearDiscoveryCache,neighbour,chapterTree,chapterRows,navHTML,localDestination}=require('../extensions/paper-writing/book-index');
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
test('nested categories use authored names, retain depth and are all expanded by default',()=>fixture((root,write)=>{
  write('README.md','# 总书\n[第一册：入门](manuscript/one/README.md)\n[第二册：进阶](manuscript/two/README.md)');
  write('manuscript/one/README.md','# 入门\n[基础知识](basics/README.md)');
  write('manuscript/one/basics/README.md','# 基础知识\n[第一章](01.md)');
  write('manuscript/two/README.md','# 进阶\n[第二章](02.md)');
  const first=write('manuscript/one/basics/01.md','# 第一章');write('manuscript/two/02.md','# 第二章');
  const book=buildBook(root),tree=chapterTree(book);
  assert.deepEqual(tree.map(n=>n.title),['第一册：入门','第二册：进阶']);
  assert.equal(tree[0].children[0].title,'基础知识');
  assert.equal(tree[0].children[0].children[0].type,'chapter');
  const html=navHTML(book,first).top;
  assert.equal((html.match(/class="paper-toc-group" open/g)||[]).length,3);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  assert.deepEqual(chapterRows(book).filter(n=>n.type==='chapter').map(n=>n.breadcrumb),['第一册：入门 › 基础知识','第二册：进阶']);
}));

test('nested libraries list sibling books once and keep collection files outside them', () => fixture((library, write) => {
  const nested = path.join(library, 'collection');
  const one = write('collection/one/chapters/01.md', '# One');
  write('collection/one/README.md', '# First book\n[One](chapters/01.md)');
  write('collection/two/README.md', '# Second book\n[Two](chapters/02.md)');
  const two = write('collection/two/chapters/02.md', '# Two');
  const index = write('collection/README.md', '# Library overview');
  write('ordinary/README.md', '# Ordinary book');
  for (const roots of [[library, nested], [nested, library, nested]]) {
    assert.deepEqual(shelf(roots).map(b => b.title).sort(), ['First book', 'Ordinary book', 'Second book']);
    for (const file of [one, two]) {
      const root = findBookRoot(file, roots);
      assert.equal(root, path.dirname(path.dirname(file)));
      assert.equal(neighbour(buildBook(root), file, 1), undefined);
    }
    assert.equal(findBookRoot(index, roots), null);
  }
}));

test('chapter links in a book README keep their order and omit root-level editorial companions', () => fixture((root, write) => {
  const next = write('chapters/02.md', '# Two');
  const first = write('chapters/01.md', '# One');
  const companions = ['PROGRESS.md', 'OUTLINE.md', 'SYMPTOM_INDEX.md'];
  for (const name of companions) write(name, '# Companion');
  const refs = companions.map(name => '[' + name + '](' + name + ')');
  write('README.md', ['# Book', ...refs, '[Two](chapters/02.md)', '[One](chapters/01.md)'].join('\n'));
  assert.deepEqual(buildBook(root).chapters.map(c => c.file), [next, first]);
  write('SUMMARY.md', '# Contents\n[Outline](OUTLINE.md)\n[Two](chapters/02.md)');
  assert.deepEqual(buildBook(root).chapters.map(c => c.file), [path.join(root, 'OUTLINE.md'), next]);
}));

test('a restored chapter outside the shelves uses the nearest authored contents in its workspace', () => fixture((root, write) => {
  const workspace = path.join(root, 'course'), library = path.join(root, 'shelf');
  write('SUMMARY.md', '# Outside the workspace');
  write('course/README.md', '# All materials');
  write('course/book/SUMMARY.md', '# Old edition');
  const contents = write('course/book/manuscript/SUMMARY.md', '[One](01.md)\n[Two](02.md)');
  const chapter = write('course/book/manuscript/02.md', '# Two');
  const previous = write('course/book/manuscript/01.md', '# One');
  for (const libraries of [[], [library]]) {
    const bookRoot = findBookRoot(chapter, libraries, [workspace]);
    assert.equal(bookRoot, path.dirname(contents));
    assert.equal(neighbour(buildBook(bookRoot), chapter, -1).file, previous);
  }
  assert.equal(findBookRoot(write('course/loose.md', '# Note'), [library], [workspace]), null);
  assert.equal(findBookRoot(chapter, [library], []), null);
}));

test('a collection resolves a book inside its manuscript wrapper before editorial files', () => fixture((library, write) => {
  const collection=path.join(library,'software-factory');
  write('software-factory/README.md','# 两本书\n[实践版](practice/manuscript/README.md)\n[精译版](translation/README.md)');
  write('software-factory/practice/BOOK_GLOSSARY.md','# 编辑术语');
  write('software-factory/practice/PROGRESS.md','# 进度');
  write('software-factory/practice/raw_chapters/01.md','# 英文原料');
  write('software-factory/practice/manuscript/README.md','# 工程实践版');
  write('software-factory/practice/manuscript/SUMMARY.md','[One](01.md)\n[Two](02.md)');
  const first=write('software-factory/practice/manuscript/01.md','# One');
  const last=write('software-factory/practice/manuscript/02.md','# Two');
  write('software-factory/translation/README.md','# 中文精译版');
  write('software-factory/translation/SUMMARY.md','[Lesson](lessons/01.md)');
  const translated=write('software-factory/translation/lessons/01.md','# Lesson');
  for(const libraries of [[library,collection],[collection,library,collection]]){
    const books=shelf(libraries);
    assert.equal(books.length,2);
    const practice=books.find(b=>b.root===path.dirname(first));
    assert.ok(practice,'use the manuscript contents as the practice book boundary');
    assert.equal(practice.title,'工程实践版');
    assert.equal(findBookRoot(first,libraries),practice.root);
    assert.equal(findBookRoot(translated,libraries),path.dirname(path.dirname(translated)));
    assert.deepEqual(buildBook(practice.root).chapters.map(ch=>ch.file),[first,last]);
    assert.equal(neighbour(buildBook(practice.root),last,1),undefined);
    assert.equal(findBookRoot(path.join(collection,'practice/raw_chapters/01.md'),libraries),null);
  }
}));

test('an authored book root keeps its nested volumes and a wrapper without an index stays intact', () => fixture((library, write) => {
  write('authored/README.md','# 多卷本\n[One](manuscript/SUMMARY.md)\n[Two](other/SUMMARY.md)');
  write('authored/manuscript/SUMMARY.md','[One](01.md)');
  const first=write('authored/manuscript/01.md','# One');
  write('authored/other/SUMMARY.md','[Two](02.md)');
  const second=write('authored/other/02.md','# Two');
  const loose=write('simple/chapters/01.md','# Simple');
  assert.equal(findBookRoot(first,[library]),path.join(library,'authored'));
  assert.equal(findBookRoot(loose,[library]),path.join(library,'simple'));
  assert.deepEqual(buildBook(path.join(library,'authored')).chapters.map(c=>c.file),[first,second]);
}));

test('one library automatically discovers independent books through multiple wrappers',()=>fixture((lib,write)=>{
  write('collection/README.md','# 合集\n[实践](practice/manuscript/SUMMARY.md)\n[译本](translation/TOC.md)');
  for(const folder of ['practice/manuscript','translation']){
    write(`collection/${folder}/README.md`,'# '+folder);
    write(`collection/${folder}/`+(folder==='translation'?'TOC.md':'SUMMARY.md'),'# 目录\n[一](chapters/01.md)\n[二](chapters/02.md)');
    write(`collection/${folder}/chapters/01.md`,'# 一');write(`collection/${folder}/chapters/02.md`,'# 二');
  }
  write('collection/practice/raw_chapters/01.md','# 原料');
  const roots=['practice/manuscript','translation'].map(p=>path.join(lib,'collection',p));
  assert.deepEqual(shelf([lib]).map(b=>b.root).sort(),roots.sort());
  assert.equal(findBookRoot(path.join(lib,'collection/README.md'),[lib]),null);
  assert.equal(findBookRoot(path.join(lib,'collection/practice/raw_chapters/01.md'),[lib]),null);
  for(const root of roots){const book=buildBook(root,{separateBooks:true});assert.equal(book.chapters.length,2);for(const c of book.chapters)assert.equal(findBookRoot(c.file,[lib]),root);assert.equal(neighbour(book,book.chapters.at(-1).file,1),undefined);}
  assert.deepEqual(shelf([lib,path.join(lib,'collection')]).map(b=>b.root).sort(),roots.sort());
}));
test('chapter delivery packages and continuous numbered sections remain one book',()=>fixture((lib,write)=>{
  write('course/README.md','# 全书\n[一](delivery/one/README.md)\n[二](delivery/two/README.md)');
  for(const [name,numbers] of [['one',[1,2]],['two',[3,4]]]){
    write(`course/delivery/${name}/README.md`,'# 分类\n'+numbers.map(n=>`[章](${n}.md)`).join('\n'));
    for(const n of numbers)write(`course/delivery/${name}/${n}.md`,'# 正文');
  }
  write('course/packages/ch05/README.md','# 第5章交付包\n[正文](05.md)');write('course/packages/ch05/05.md','# 第5章');
  assert.equal(discoverBooks(path.join(lib,'course')).split,false);
  assert.equal(shelf([lib]).length,1);
  assert.equal(findBookRoot(path.join(lib,'course/delivery/two/4.md'),[lib]),path.join(lib,'course'));
}));
test('original edition and nested independent editions have disjoint navigation',()=>fixture((lib,write)=>{
  write('mixed/README.md','# 原版与分册\n[一](01.md)\n[二](02.md)\n[新版](editions/new/README.md)');
  write('mixed/01.md','# 原一');write('mixed/02.md','# 原二');
  write('mixed/editions/new/README.md','# 新版\n[一](01.md)\n[二](02.md)');
  write('mixed/editions/new/01.md','# 新一');write('mixed/editions/new/02.md','# 新二');
  const parent=path.join(lib,'mixed'),child=path.join(parent,'editions/new');
  assert.deepEqual(shelf([lib]).map(b=>b.root).sort(),[parent,child].sort());
  const original=buildBook(parent,{separateBooks:true}),edition=buildBook(child,{separateBooks:true});
  assert.equal(original.chapters.length,2);assert.equal(edition.chapters.length,2);
  for(const book of [original,edition])for(const c of book.chapters)assert.equal(findBookRoot(c.file,[lib]),book.root);
  assert.equal(neighbour(original,original.chapters[1].file,1),undefined);
}));
test('module-prefixed chapters and indexless named manuscripts can form a collection',()=>fixture((lib,write)=>{
  write('collection/manuscript/Alpha_Book/README.md','# Alpha');
  for(const n of ['01','02']){
    write(`collection/manuscript/Alpha_Book/004_${n}_正文.md`,'# 正文');
    write(`collection/manuscript/Beta_Book/${n}_正文.md`,'# 正文');
  }
  const books=shelf([lib]);assert.equal(books.length,2);
  assert.ok(books.find(b=>b.title==='Beta_Book').entry.endsWith('01_正文.md'));
}));
test('topic categories, review records and archived duplicates do not become books',()=>fixture((lib,write)=>{
  write('book/README.md','# 按类型读本');
  for(const name of ['A','B']){
    write(`book/${name}/README.md`,'# 本书按主题介绍实践');
    for(const n of ['01','02'])write(`book/${name}/chapters/T01-C${n}-实践.md`,'# 实践');
  }
  for(const folder of ['history/old','qa_reports','raw_chapters','工作副本/book']){
    write(`book/${folder}/README.md`,'# Book');write(`book/${folder}/01.md`,'# 一');write(`book/${folder}/02.md`,'# 二');
  }
  assert.equal(discoverBooks(path.join(lib,'book')).split,false);
  assert.equal(shelf([lib]).length,1);
  assert.equal(findBookRoot(path.join(lib,'book/history/old/01.md'),[lib]),null);
}));
test('discovery does not follow symlinked book directories outside a library',()=>fixture((lib,write)=>{
  write('collection/one/README.md','# Book');write('collection/one/01.md','# 一');write('collection/one/02.md','# 二');
  fs.symlinkSync(path.join(lib,'collection/one'),path.join(lib,'collection/alias'),'dir');
  assert.equal(shelf([lib]).length,1);
  assert.equal(discoverBooks(path.join(lib,'collection')).split,false);
}));
test('refresh invalidates discovery when a second book is added',()=>fixture((lib,write)=>{
  write('collection/one/README.md','# One');write('collection/one/01.md','# 一');write('collection/one/02.md','# 二');
  assert.equal(shelf([lib]).length,1);
  write('collection/two/README.md','# Two');write('collection/two/01.md','# 一');write('collection/two/02.md','# 二');
  clearDiscoveryCache();assert.equal(shelf([lib]).length,2);
}));
test('bounded discovery conservatively retains a book instead of publishing a partial collection',()=>fixture((lib,write)=>{
  write('collection/one/README.md','# One');write('collection/one/01.md','# 一');write('collection/one/02.md','# 二');
  write('collection/two/README.md','# Two');write('collection/two/01.md','# 一');write('collection/two/02.md','# 二');
  write('collection/a/b/c/d/e/f/g/h/i.md','# Deep');
  const d=discoverBooks(path.join(lib,'collection'));assert.equal(d.truncated,true);assert.equal(d.split,false);
  assert.equal(shelf([lib]).length,1);
}));

test('collection landing pages expose nested chapters in authored module order without merging book boundaries',()=>fixture((lib,write)=>{
  const root=path.join(lib,'course');
  write('course/README.md','# 四模块课程\n[Core](manuscript/Z_Core/README.md)\n[Agents](manuscript/A_Agents/README.md)\n[Core1](manuscript/Z_Core/01.md)\n[Core2](manuscript/Z_Core/02.md)\n[Agents1](manuscript/A_Agents/01.md)\n[Agents2](manuscript/A_Agents/02.md)');
  for(const name of ['Z_Core','A_Agents']){
    write(`course/manuscript/${name}/README.md`,'# 独立书稿\n[大纲](00_OUTLINE.md)\n[一](01.md)\n[二](02.md)');
    write(`course/manuscript/${name}/00_OUTLINE.md`,'# 编撰大纲');
    write(`course/manuscript/${name}/01.md`,'# 第1章');write(`course/manuscript/${name}/02.md`,'# 第2章');
  }
  const entry=path.join(root,'README.md'),c=buildCollection(root);
  assert.equal(findBookRoot(entry,[lib]),null);
  assert.equal(collectionEntry(entry,[lib]),entry);
  assert.equal(c.isCollection,true);assert.equal(c.bookCount,2);assert.equal(c.chapters.length,4);
  assert.deepEqual(chapterRows(c).filter(r=>r.type==='group').map(r=>r.title),['Core','Agents']);
  const html=navHTML(c,entry);assert.match(html.top,/总目录 · 4 章/);assert.match(html.top,/paper-toc-group" open/);assert.doesNotMatch(html.top,/下一章/);assert.equal(html.bottom,'');
  for(const chapter of c.chapters){const bookRoot=findBookRoot(chapter.file,[lib]);assert.equal(bookRoot,path.dirname(chapter.file));assert.equal(collectionEntry(chapter.file,[lib]),entry);const b=buildBook(bookRoot,{separateBooks:true});assert.equal(neighbour(b,b.chapters.at(-1).file,1),undefined);}
  const b=buildBook(path.dirname(c.chapters[0].file));b.collectionEntry=entry;
  assert.match(navHTML(b,c.chapters[0].file).top,/class="paper-collection-home"/);
}));
