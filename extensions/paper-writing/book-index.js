'use strict';
const fs = require('node:fs');
const path = require('node:path');
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const CONTENTS_NAMES = ['SUMMARY.md', 'CONTENTS.md', '目录.md', 'TOC.md'];
const INDEX_NAMES = [...CONTENTS_NAMES, 'README.md', 'readme.md', 'index.md', 'INDEX.md'];
const SKIP_DIR = /^(?:[._].*|node_modules|vendor|assets?|images?|figures?|media|code|scripts?|tools?|skills?|reviews?|qa_reports|evidence|tracking|workpacks|backups?|history|raw(?:[_-].*)?|originals?|lab|examples|projects|工作副本|来源归档|检查报告)$/i;
const AUXILIARY = /^(?:AGENTS|CLAUDE|LICENSE|CHANGELOG|GLOSSARY|SOURCE[S_].*|SOURCE_MAP|source_mapping|editorial.*|.*review_log|TRANSLATION_(?:NOTES|REVIEW)|审校.*|审稿.*|校对.*|来源映射.*|00[_ -].*(?:来源|审校).*)\.(?:md|markdown)$/i;
const isMarkdown = file => /\.(md|markdown)$/i.test(file);
const isIndex = file => INDEX_NAMES.some(name => name.toLowerCase() === path.basename(file).toLowerCase());
const MANUSCRIPT_DIR = /^(?:manuscripts?|chapters?|processed|markdown|正文|书稿)$/i;
function inside(root, file) {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
function readHead(file, bytes = 262144) {
  let fd;
  try { fd = fs.openSync(file, 'r'); const b = Buffer.alloc(bytes); return b.subarray(0, fs.readSync(fd, b, 0, bytes, 0)).toString('utf8'); }
  catch { return ''; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function titleOf(file) {
  const heading = readHead(file, 16384).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').match(/^#\s+(.+)$/m);
  return (heading ? heading[1].replace(/[*`]/g, '').replace(/\s+#+\s*$/, '') : path.basename(file, path.extname(file))).trim();
}
function safeFile(root, candidate) {
  try {
    if (!inside(root, candidate) || !fs.statSync(candidate).isFile()) return false;
    return inside(fs.realpathSync(root), fs.realpathSync(candidate));
  } catch { return false; }
}
function useful(root, file) {
  return isMarkdown(file) && !AUXILIARY.test(path.basename(file)) && !path.relative(root, file).split(path.sep).slice(0, -1).some(p => SKIP_DIR.test(p));
}
function links(text) {
  // Only local Markdown destinations are considered. Ignore examples in fenced blocks.
  const clean = text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');
  const refs = new Map([...clean.matchAll(/^\s*\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gm)].map(m => [m[1].toLowerCase(), m[2] || m[3]]));
  const result = [];
  const pattern = /(?<!!)\[([^\]\n]+)\](?:\(\s*(?:<([^>]+)>|((?:\\.|[^\s()]|\([^()]*\))+))(?:\s+["'][^\n]*?["'])?\s*\)|\[([^\]]*)\])/g;
  for (const m of clean.matchAll(pattern)) {
    const target = m[2] || m[3] || refs.get((m[4] || m[1]).toLowerCase());
    if (target) result.push({ title: m[1], target });
  }
  return result;
}
function localDestination(root, from, target) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(target)) return null;
  try {
    const raw = decodeURIComponent(target.split(/[?#]/, 1)[0]).replace(/\\([ ()])/g, '$1');
    if (!raw || raw.includes('\0')) return null;
    const file = path.resolve(path.dirname(from), raw);
    return useful(root, file) && safeFile(root, file) ? file : null;
  } catch { return null; }
}
function indexIn(folder, names = INDEX_NAMES) { return names.map(name => path.join(folder, name)).find(file => safeFile(folder, file)); }
function readingRoot(folder, depth = 0) {
  // Preserve an authored top-level book, including its nested volumes. Only
  // unwrap a content container when it has one unambiguous reading index.
  if (indexIn(folder) || depth >= 5) return folder;
  let entries; try { entries = fs.readdirSync(folder, {withFileTypes:true}); } catch { return folder; }
  const candidates = entries.filter(e => e.isDirectory() && MANUSCRIPT_DIR.test(e.name))
    .map(e => readingRoot(path.join(folder,e.name), depth+1)).filter(dir => indexIn(dir));
  return candidates.length === 1 ? candidates[0] : folder;
}
function bookTitle(root, entry) { const readme=['README.md','readme.md','INDEX.md','index.md'].map(n=>path.join(root,n)).find(p=>safeFile(root,p)); return readme||entry?titleOf(readme||entry):path.basename(root); }
const discoveryCache = new Map();
function clearDiscoveryCache() { discoveryCache.clear(); }
function chapterNumber(file) {
  const name = path.basename(file);
  const moduleChapter = name.match(/^\d{1,3}[_-](\d{1,3})(?=[_. -])/);
  if (moduleChapter) return Number(moduleChapter[1]);
  const match = name.match(/^(?:(?:chapter|ch|c)[_ -]?)?(\d{1,3})(?=[_. -])/i);
  return match ? Number(match[1]) : null;
}
// Recognize independent reading units, not merely directories with README files.
// Repeated chapter sequences and local contents distinguish books from parts of
// a single continuous course. No library names or machine paths are special-cased.
function discoverBooks(container) {
  container = path.resolve(container);
  const cached = discoveryCache.get(container);
  if (cached && Date.now() - cached.time < 30000) return cached.value;
  let scanned = 0, truncated = false;
  function scan(folder, depth = 0) {
    if (depth > 7 || scanned >= 600) { truncated = true; return []; }
    scanned++;
    let entries; try { entries = fs.readdirSync(folder, {withFileTypes:true}).sort((a,b)=>collator.compare(a.name,b.name)); } catch { return []; }
    const children = entries.filter(e=>e.isDirectory() && !SKIP_DIR.test(e.name));
    const descendants = children.flatMap(e=>scan(path.join(folder,e.name),depth+1));
    let entry = indexIn(folder);
    const manuscriptName = /(?:^|[_ -])(?:book|monograph|vol\d+)(?:$|[_ -])|书稿|专著|第.+卷/i.test(path.basename(folder));
    if (!entry && !manuscriptName) return descendants;
    const own = new Set();
    const add = file => {
      if (useful(container,file) && !isIndex(file) && !descendants.some(book=>inside(book.root,file)) && safeFile(container,file)) own.add(file);
    };
    for (const e of entries) if (e.isFile()) add(path.join(folder,e.name));
    // Indexes may point into chapter folders or numbered sections. Reading only
    // the indexes keeps discovery independent of the size of chapter bodies.
    const text = entry ? readHead(entry) : '';
    for (const link of links(text)) { const file = localDestination(folder,entry,link.target); if (file) add(file); }
    for (const e of children.filter(e=>/^(?:chapters?|正文)$/i.test(e.name))) {
      const dir = path.join(folder,e.name);
      try { for (const f of fs.readdirSync(dir,{withFileTypes:true})) if(f.isFile()) add(path.join(dir,f.name)); } catch {}
    }
    const numbered = [...own].map(chapterNumber).filter(n=>n !== null && n > 0);
    const sequence = new Set(numbered);
    const identity = /本书|全书|专著|独立.{0,8}卷|[《》]|\bbook\b/i.test(bookTitle(folder,entry)+'\n'+text.slice(0,12000));
    const section = /^(?:(?:part|section|chapter)[_ -]?\d+|第[\d一二三四五六七八九十]+[篇部分章])/i.test(path.basename(folder));
    const dedicated = children.some(e=>/^chapters$/i.test(e.name));
    const independent = !section && ((sequence.has(1) && (sequence.size >= 2 || (dedicated && identity))) || (descendants.length && sequence.size >= 2));
    if (independent) {
      const title = entry ? bookTitle(folder,entry) : path.basename(folder);
      entry ||= [...own].filter(f=>chapterNumber(f)>0).sort((a,b)=>collator.compare(a,b))[0];
      return [{root:folder,entry,title,reason:dedicated?'独立目录与章节文件夹':manuscriptName&&!text?'独立书稿文件夹与重新起始的章节编号':'独立目录与重新起始的章节编号',evidence:[...own].filter(f=>chapterNumber(f)>0)},...descendants];
    }
    return descendants;
  }
  let books = scan(container);
  // A sole nested manuscript is still the same book; retain its authored outer
  // boundary. Splitting only happens with evidence for at least two books.
  const split = !truncated && books.length >= 2;
  if (!split) books = [{root:readingRoot(container),reason:truncated?'达到扫描上限，保留原书边界':'单本书或证据不足，保留原书边界'}];
  const value = {container,books,split,scanned,truncated};
  if (discoveryCache.size >= 256) discoveryCache.delete(discoveryCache.keys().next().value);
  discoveryCache.set(container,{time:Date.now(),value});
  return value;
}
function buildBook(root, {separateBooks = false} = {}) {
  root = path.resolve(root);
  const discovery = separateBooks ? discoverBooks(root) : null;
  const excluded = discovery?.split ? discovery.books.filter(b=>b.root!==root).map(b=>b.root) : [];
  const excludedFile = file => excluded.some(dir=>inside(dir,file));
  const entry = indexIn(root), visited = new Set(), seen = new Set(), chapters = [], groupLabels = {};
  let truncated = false;
  function add(file) {
    if (seen.has(file)) return;
    if (chapters.length >= 3000) { truncated = true; return; }
    seen.add(file);
    chapters.push({ file, title: titleOf(file), group: path.relative(root, path.dirname(file)).split(path.sep).join(' / ') || '正文' });
  }
  function visit(index, depth = 0) {
    if (visited.has(index) || depth > 16 || visited.size >= 400) return;
    visited.add(index);
    for (const link of links(readHead(index))) {
      const file = localDestination(root, index, link.target);
      if (!file || excludedFile(file)) continue;
      if (isIndex(file)) {
        // A contents page's "back to README" link must not import other editions.
        if (path.dirname(file) === path.dirname(index) && path.basename(index).toLowerCase() !== 'readme.md') continue;
        if (link.title.length > 3 && !/^(?:进入|返回|阅读|原书稿总大纲|本书导读)/.test(link.title)) groupLabels[path.relative(root,path.dirname(file))] = link.title.replace(/[*`]/g,'');
        visit(file, depth + 1);
      }
      else add(file);
    }
  }
  if (entry) visit(entry);
  // A real table of contents is authoritative; do not append auxiliary manuscripts.
  if (!chapters.length) {
    let count = 0;
    function walk(dir, depth = 0) {
      if (depth > 12 || count++ >= 1500) { truncated = true; return; }
      let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => collator.compare(a.name,b.name)); } catch { return; }
      for (const item of entries) {
        const file = path.join(dir, item.name);
        if (item.isDirectory() && !SKIP_DIR.test(item.name) && !excludedFile(file)) walk(file, depth + 1);
        else if (item.isFile() && useful(root,file) && !isIndex(file)) add(file);
      }
    }
    walk(root);
  }
  // A landing page can link to editorial records alongside its chapter list.
  // Keep explicit contents files authoritative, including their appendices.
  const chapterDir = path.join(root, 'chapters');
  const landingPage = entry && path.basename(entry).toLowerCase() === 'readme.md';
  const readingOrder = landingPage && chapters.some(ch => inside(chapterDir, ch.file))
    ? chapters.filter(ch => !/^(?:PROGRESS|SYMPTOM_INDEX|OUTLINE)\.md$/i.test(path.relative(root, ch.file)))
    : chapters;
  return { root, entry, title: bookTitle(root,entry), chapters: readingOrder, groupLabels, truncated };
}
function findBookRoot(file, libraries = [], workspaceRoots = []) {
  file = path.resolve(file);
  // A library's immediate child is a book, sometimes with its reading index
  // under a manuscript container alongside raw sources and editorial records.
  for (const library of [...libraries].sort((a,b) => b.length-a.length)) {
    if (!inside(library, file)) continue;
    const parts = path.relative(library, file).split(path.sep);
    if (parts.length <= 1 || SKIP_DIR.test(parts[0])) return null;
    if (parts.slice(0,-1).some(p=>SKIP_DIR.test(p))) return null;
    const matches = discoverBooks(path.join(library, parts[0])).books.filter(b=>inside(b.root,file));
    return matches.sort((a,b)=>b.root.length-a.root.length)[0]?.root || null;
  }
  const workspace = workspaceRoots.filter(w => inside(w,file)).sort((a,b) => b.length-a.length)[0];
  // An authored table of contents also identifies a book outside the configured shelves.
  if (workspace && isMarkdown(file)) {
    for (let folder = path.dirname(file); inside(workspace, folder); folder = path.dirname(folder)) {
      if (indexIn(folder, CONTENTS_NAMES)) return folder;
      if (folder === workspace || folder === path.dirname(folder)) break;
    }
  }
  if (libraries.length) return null;
  if (workspace && indexIn(workspace)) return workspace;
  let folder = path.dirname(file);
  for (let n = 0; n < 10; n++) {
    if (indexIn(folder)) return folder;
    const parent = path.dirname(folder); if (parent === folder || folder === workspace) break; folder = parent;
  }
  return null;
}
function collectionEntry(file, libraries = []) {
  for (const library of [...libraries].sort((a,b)=>a.length-b.length)) {
    if (!inside(library,file)) continue;
    const parts=path.relative(library,file).split(path.sep);
    if(parts.length<2 || parts.slice(0,-1).some(p=>SKIP_DIR.test(p))) continue;
    const container=path.join(library,parts[0]);
    if(discoverBooks(container).split) return path.dirname(file)===container && isIndex(file) && safeFile(container,file) ? file : indexIn(container) || null;
  }
  return null;
}
function buildCollection(root) {
  root=path.resolve(root);
  const entry=indexIn(root), discovery=discoverBooks(root);
  const ordered=[], labels={}, explicit=new Map();
  for(const link of entry ? links(readHead(entry)) : []) {
    const file=localDestination(root,entry,link.target);if(!file)continue;
    const book=discovery.books.filter(b=>inside(b.root,file)).sort((a,b)=>b.root.length-a.root.length)[0];
    if(!book || book.root===root)continue;
    if(!ordered.includes(book))ordered.push(book);
    if(isIndex(file) && !labels[book.root])labels[book.root]=link.title;
    if(!isIndex(file)) {if(!explicit.has(book.root))explicit.set(book.root,[]);if(!explicit.get(book.root).includes(file))explicit.get(book.root).push(file);}
  }
  for(const book of discovery.books)if(book.root!==root&&!ordered.includes(book))ordered.push(book);
  const chapters=[],groupLabels={};let truncated=discovery.truncated;
  for(const item of ordered) {
    const book=buildBook(item.root,{separateBooks:true});truncated ||= book.truncated;
    // The collection's authored chapter links take precedence over editorial
    // outlines linked from each delivery README. Otherwise use the book's TOC.
    const files=explicit.get(item.root);
    chapters.push(...(files?files.map(file=>({file,title:titleOf(file),group:path.relative(root,path.dirname(file))})):book.chapters));
    groupLabels[path.relative(root,item.root)]=labels[item.root] || item.title || book.title;
  }
  return {root,entry,title:bookTitle(root,entry),chapters,groupLabels,truncated,isCollection:true,bookCount:ordered.length};
}
function shelf(libraries) {
  const books = [], seen = new Set();
  function nestedEntry(folder, depth=0, budget={left:120}) {
    if(depth>5 || --budget.left<0)return null;
    const index=indexIn(folder);if(index)return index;
    let items;try{items=fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>collator.compare(a.name,b.name));}catch{return null;}
    const file=items.find(item=>item.isFile() && useful(folder,path.join(folder,item.name)));
    if(file)return path.join(folder,file.name);
    for(const item of items){if(item.isDirectory()&&!SKIP_DIR.test(item.name)){const found=nestedEntry(path.join(folder,item.name),depth+1,budget);if(found)return found;}}
    return null;
  }
  const roots = [...new Set(libraries.map(folder => path.resolve(folder)))];
  for (const root of roots) {
    let entries; try { entries = fs.readdirSync(root, {withFileTypes:true}); } catch { continue; }
    for (const d of entries) {
      if (!d.isDirectory() || SKIP_DIR.test(d.name)) continue;
      const container = path.join(root, d.name);
      if (roots.includes(container)) continue;
      for (const discovered of discoverBooks(container).books) {
        const bookRoot = discovered.root;
        if (roots.includes(bookRoot) || seen.has(bookRoot)) continue;
        const entry = discovered.entry || nestedEntry(bookRoot);
        if (entry) { seen.add(bookRoot); books.push({root:bookRoot,entry,title:discovered.title || bookTitle(bookRoot,entry),collection:container}); }
      }
    }
  }
  return books.sort((a,b) => collator.compare(a.title,b.title));
}
function position(book, file) { return book.chapters.findIndex(chapter => chapter.file === file); }
function chapterTree(book) {
  const root={children:[]}, groups=new Map();
  book.chapters.forEach((chapter,index)=>{
    const relative=path.relative(book.root,path.dirname(chapter.file));
    const parts=relative?relative.split(path.sep):[];
    let parent=root,folder=book.root;
    for(const part of parts){
      folder=path.join(folder,part);
      let node=groups.get(folder);
      if(!node){
        const entry=indexIn(folder), label=book.groupLabels?.[path.relative(book.root,folder)];
        const title=label || (entry?bookTitle(folder,entry):/^ch\d+$/i.test(part)?`第 ${Number(part.slice(2))} 章`:part);
        node={type:'group',title,name:part,children:[]};groups.set(folder,node);parent.children.push(node);
      }
      parent=node;
    }
    parent.children.push({type:'chapter',chapter,index});
  });
  function simplify(children){
    for(const node of children)if(node.type==='group')node.children=simplify(node.children);
    return children.length===1 && children[0].type==='group' && MANUSCRIPT_DIR.test(children[0].name)?children[0].children:children;
  }
  return simplify(root.children);
}
function chapterRows(book) {
  const result=[];
  function walk(nodes,parents=[]){for(const node of nodes){if(node.type==='group'){result.push({type:'group',title:node.title,depth:parents.length});walk(node.children,[...parents,node.title]);}else result.push({...node,breadcrumb:parents.join(' › ')});}}
  walk(chapterTree(book));return result;
}
function neighbour(book, file, offset) {
  const at = position(book,file);
  if (at < 0) return offset > 0 ? book.chapters[0] : undefined;
  return book.chapters[at + offset];
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function navHTML(book, file, books = []) {
  const at = position(book,file), previous = neighbour(book,file,-1), next = neighbour(book,file,1);
  function anchor(target, label, extra = '') {
    const href = path.relative(path.dirname(file), target).split(path.sep).map(encodeURIComponent).join('/');
    return `<a href="${escape(href)}" data-href="${escape(href)}" ${extra}>${escape(label)}</a>`;
  }
  const button = (chapter,label) => chapter ? anchor(chapter.file,label,`title="${escape(chapter.title)}"`) : `<span aria-disabled="true">${escape(label)}</span>`;
  function directory(nodes) {
    return nodes.map(node=>node.type==='group'
      ? `<li class="paper-toc-category"><details class="paper-toc-group" open><summary>${escape(node.title)}</summary><ol>${directory(node.children)}</ol></details></li>`
      : `<li${node.index===at?' class="paper-current"':''}>${anchor(node.chapter.file,`${node.index+1}. ${node.chapter.title}`,node.index===at?'aria-current="page"':'')}</li>`).join('');
  }
  const bookList = books.map(b=>{
    const collection = b.collection || b.root;
    const description = [path.basename(collection),path.relative(collection,b.root)].filter(Boolean).join(' / ');
    return `<li data-book-search="${escape(b.title+' '+description)}">${anchor(b.entry,b.title)}<small>${escape(description)}</small></li>`;
  }).join('');
  const search = bookList ? `<details class="paper-shelf"><summary>搜索书籍</summary><div class="paper-shelf-panel"><label class="paper-book-search-label">搜索书籍<input class="paper-book-search-input" type="search" placeholder="书名、合集或目录 · 空格分隔关键词" autocomplete="off" spellcheck="false"></label><p class="paper-book-search-count" role="status" aria-live="polite">显示 ${books.length} / ${books.length} 本书</p><p class="paper-book-search-empty" hidden>没有找到符合条件的书籍。试试更短的书名或合集名。</p><ul aria-label="书籍搜索结果">${bookList}</ul></div></details>` : '';
  const toc=label=>`<details class="paper-chapter-list"><summary>${label}</summary><ol>${directory(chapterTree(book))}</ol></details>`;
  const controls = book.isCollection
    ? `<span>合集 · ${book.bookCount} 册</span>${toc(`总目录 · ${book.chapters.length} 章`)}<span>选择分册或章节开始阅读</span>`
    : `${button(previous,'← 上一章')}${toc(`目录 · ${at<0?'导读':at+1} / ${book.chapters.length}`)}${button(next,at<0?'开始阅读 →':'下一章 →')}`;
  const collectionHome=book.collectionEntry?anchor(book.collectionEntry,'合集目录','class="paper-collection-home"'):'';
  return {
    top: `<nav class="paper-book-nav" aria-label="书籍阅读导航"><div class="paper-book-title">${search}${collectionHome}${book.entry?anchor(book.entry,book.title):escape(book.title)}</div><div class="paper-book-controls">${controls}</div></nav>`,
    bottom: book.isCollection?'':`<nav class="paper-book-footer" aria-label="章末翻页">${button(previous,'← 上一章')}${button(next,next?'下一章 →':'已到全书末章')}</nav>`
  };
}
module.exports = { buildBook, buildCollection, collectionEntry, findBookRoot, shelf, discoverBooks, clearDiscoveryCache, position, neighbour, chapterTree, chapterRows, navHTML, inside, links, localDestination };
