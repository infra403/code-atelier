'use strict';

(() => {
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().trim();
  function matchesBook(text, query) {
    const haystack = normalize(text);
    return normalize(query).split(/\s+/u).filter(Boolean).every(term => haystack.includes(term));
  }
  if (typeof module !== 'undefined') module.exports = {matchesBook};
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  window.__paperBookSearch?.dispose();
  const lifetime = new AbortController(), {signal} = lifetime;
  function filter(menu) {
    const input = menu.querySelector('.paper-book-search-input');
    if (!input) return;
    const rows = [...menu.querySelectorAll('[data-book-search]')];
    let count = 0;
    for (const row of rows) {
      row.hidden = !matchesBook(row.dataset.bookSearch, input.value);
      if (!row.hidden) count++;
    }
    menu.querySelector('.paper-book-search-count').textContent = `显示 ${count} / ${rows.length} 本书`;
    menu.querySelector('.paper-book-search-empty').hidden = count > 0;
  }
  function refresh() {
    document.querySelectorAll('.paper-shelf').forEach(filter);
  }
  document.addEventListener('input', event => {
    if (event.target.matches('.paper-book-search-input')) filter(event.target.closest('.paper-shelf'));
  }, {signal});
  document.addEventListener('toggle', event => {
    const menu = event.target;
    if (!menu.matches?.('.paper-shelf') || !menu.open) return;
    menu.closest('nav')?.querySelectorAll('.paper-chapter-list[open], .paper-article-outline[open]').forEach(other=>{other.open=false;});
    filter(menu);
    menu.querySelector('.paper-book-search-input')?.focus({preventScroll:true});
  }, {capture:true,signal});
  document.addEventListener('keydown', event => {
    const menu = event.target.closest?.('.paper-shelf');
    if (!menu?.open) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      menu.open = false; menu.querySelector('summary').focus({preventScroll:true});
    } else if (event.target.matches('.paper-book-search-input') && !event.isComposing) {
      const first = menu.querySelector('[data-book-search]:not([hidden]) a');
      if (event.key === 'ArrowDown') { event.preventDefault(); first?.focus({preventScroll:true}); }
      if (event.key === 'Enter') { event.preventDefault(); first?.click(); }
    }
  }, {signal});
  document.addEventListener('click', event => {
    document.querySelectorAll('.paper-shelf[open]').forEach(menu=>{
      if (!menu.contains(event.target) || event.target.closest('a')) menu.open = false;
    });
  }, {signal});
  window.addEventListener('vscode.markdown.updateContent', refresh, {signal});
  const initialContent = new MutationObserver(()=>{
    if (document.querySelector('.markdown-body')) { initialContent.disconnect(); refresh(); }
  });
  window.__paperBookSearch = {dispose(){lifetime.abort();initialContent.disconnect();}};
  if (document.querySelector('.markdown-body')) refresh();
  else initialContent.observe(document.documentElement,{childList:true,subtree:true});
})();
