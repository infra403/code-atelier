const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {matchesBook}=require('../extensions/paper-writing/book-search');
const {navHTML}=require('../extensions/paper-writing/book-index');

test('book search combines Chinese titles, collections and folder keywords',()=>{
  const text='《智能体的大脑：大语言模型与推理》 course-rag-pack-introduction-to-agents-tinyagents-zh-cn-2026 / manuscript/TinyAgents_Session2_Book';
  for(const query of ['智能体的大脑','TinyAgents','SESSION2','智能体 tinyagents session2','ＴＩＮＹＡＧＥＮＴＳ','  \n\t  '])assert.equal(matchesBook(text,query),true,query);
  for(const query of ['软件工厂','tinyagents SESSION3','智能体 不存在'])assert.equal(matchesBook(text,query),false,query);
});
test('search treats metacharacters literally instead of executing patterns',()=>{
  assert.equal(matchesBook('Book [A] (2026)','[A]'),true);
  assert.equal(matchesBook('Book [A] (2026)','.*'),false);
  assert.equal(matchesBook('Book [A] (2026)','[unclosed'),false);
});
test('preview search includes safe metadata, result count and normal local reading links',()=>{
  const root=path.resolve('/library/集合/Book'),entry=path.join(root,'README.md'),file=path.join(root,'01.md');
  const book={root,entry,title:'Book',chapters:[{file,title:'第一章'}]};
  const title='书名 " <script>alert(1)</script> &';
  const html=navHTML(book,file,[{root,entry,title,collection:path.dirname(root)}]).top;
  assert.match(html,/<summary>搜索书籍<\/summary>/);
  assert.match(html,/type="search"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/显示 1 \/ 1 本书/);
  assert.match(html,/data-book-search="书名 &quot; &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; 集合 \/ Book"/);
  assert.match(html,/href="README.md" data-href="README.md"/);
  assert.doesNotMatch(html,/<script>|command:/);
});
