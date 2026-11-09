'use strict';
const fs = require('node:fs');
const path = require('node:path');
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const INDEX_NAMES = ['SUMMARY.md', 'CONTENTS.md', '目录.md', 'README.md', 'readme.md', 'index.md'];
const SKIP_DIR = /^(?:\..*|node_modules|vendor|assets?|images?|figures?|media|code|scripts?|tools?|skills?|reviews?|evidence|tracking|workpacks|backups?|__pycache__)$/i;
const AUXILIARY = /^(?:AGENTS|CLAUDE|LICENSE|CHANGELOG|GLOSSARY|SOURCE[S_].*|SOURCE_MAP|source_mapping|editorial.*|.*review_log|TRANSLATION_(?:NOTES|REVIEW)|审校.*|审稿.*|校对.*|来源映射.*|00[_ -].*(?:来源|审校).*)\.(?:md|markdown)$/i;
const isMarkdown = file => /\.(md|markdown)$/i.test(file);
const isIndex = file => INDEX_NAMES.some(name => name.toLowerCase() === path.basename(file).toLowerCase());
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
function indexIn(folder) { return INDEX_NAMES.map(name => path.join(folder, name)).find(file => safeFile(folder, file)); }
function bookTitle(root, entry) { const readme=['README.md','readme.md'].map(n=>path.join(root,n)).find(p=>safeFile(root,p)); return readme||entry?titleOf(readme||entry):path.basename(root); }
function buildBook(root) {
  root = path.resolve(root);
  const entry = indexIn(root), visited = new Set(), seen = new Set(), chapters = [];
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
      if (!file) continue;
      if (isIndex(file)) {
        // A contents page's "back to README" link must not import other editions.
        if (path.dirname(file) === path.dirname(index) && path.basename(index).toLowerCase() !== 'readme.md') continue;
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
        if (item.isDirectory() && !SKIP_DIR.test(item.name)) walk(file, depth + 1);
        else if (item.isFile() && useful(root,file) && !isIndex(file)) add(file);
      }
    }
    walk(root);
  }
  return { root, entry, title: bookTitle(root,entry), chapters, truncated };
}
function findBookRoot(file, libraries = [], workspaceRoots = []) {
  file = path.resolve(file);
  // A library's immediate child is the book boundary, even with many nested volumes.
  for (const library of [...libraries].sort((a,b) => b.length-a.length)) {
    if (!inside(library, file) || file === library) continue;
    const parts = path.relative(library, file).split(path.sep);
    if (parts.length > 1 && !SKIP_DIR.test(parts[0])) return path.join(library, parts[0]);
  }
  if (libraries.length) return null;
  const workspace = workspaceRoots.filter(w => inside(w,file)).sort((a,b) => b.length-a.length)[0];
  if (workspace && indexIn(workspace)) return workspace;
  let folder = path.dirname(file);
  for (let n = 0; n < 10; n++) {
    if (indexIn(folder)) return folder;
    const parent = path.dirname(folder); if (parent === folder || folder === workspace) break; folder = parent;
  }
  return null;
}
function shelf(libraries) {
  const books = [];
  function nestedEntry(folder, depth=0, budget={left:120}) {
    if(depth>5 || --budget.left<0)return null;
    const index=indexIn(folder);if(index)return index;
    let items;try{items=fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>collator.compare(a.name,b.name));}catch{return null;}
    const file=items.find(item=>item.isFile() && useful(folder,path.join(folder,item.name)));
    if(file)return path.join(folder,file.name);
    for(const item of items){if(item.isDirectory()&&!SKIP_DIR.test(item.name)){const found=nestedEntry(path.join(folder,item.name),depth+1,budget);if(found)return found;}}
    return null;
  }
  for (const root of libraries) {
    let entries; try { entries = fs.readdirSync(root, {withFileTypes:true}); } catch { continue; }
    for (const d of entries) {
      if (!d.isDirectory() || SKIP_DIR.test(d.name)) continue;
      const bookRoot = path.join(root,d.name), entry = nestedEntry(bookRoot);
      if (entry) books.push({root:bookRoot,entry,title:bookTitle(bookRoot,entry)});
    }
  }
  return books.sort((a,b) => collator.compare(a.title,b.title));
}
function position(book, file) { return book.chapters.findIndex(chapter => chapter.file === file); }
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
  const directory = book.chapters.map((c,i) => `<li${i===at?' class="paper-current"':''}>${anchor(c.file,`${i+1}. ${c.title}`,i===at?'aria-current="page"':'')}<small>${escape(c.group)}</small></li>`).join('');
  const bookList = books.map(b=>`<li>${anchor(b.entry,b.title)}</li>`).join('');
  const controls = `${button(previous,'← 上一章')}<details class="paper-chapter-list"><summary>目录 · ${at<0?'导读':at+1} / ${book.chapters.length}</summary><ol>${directory}</ol></details>${button(next,at<0?'开始阅读 →':'下一章 →')}`;
  return {
    top: `<nav class="paper-book-nav" aria-label="书籍阅读导航"><div class="paper-book-title">${bookList?`<details class="paper-shelf"><summary>切换书籍</summary><ul>${bookList}</ul></details>`:''}${book.entry?anchor(book.entry,book.title):escape(book.title)}</div><div class="paper-book-controls">${controls}</div></nav>`,
    bottom: `<nav class="paper-book-footer" aria-label="章末翻页">${button(previous,'← 上一章')}${button(next,next?'下一章 →':'已到全书末章')}</nav>`
  };
}
module.exports = { buildBook, findBookRoot, shelf, position, neighbour, navHTML, inside, links, localDestination };
