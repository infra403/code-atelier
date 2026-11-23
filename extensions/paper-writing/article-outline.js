'use strict';

(() => {
  window.__paperArticleOutline?.dispose();
  const lifetime = new AbortController();
  const { signal } = lifetime;
  let menu, standaloneNav;

  function removeMenu() {
    menu?.remove();
    standaloneNav?.remove();
    menu = standaloneNav = undefined;
  }

  function refresh() {
    removeMenu();
    const article = document.querySelector('.markdown-body');
    if (!article) return;
    const headings = [...article.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(heading =>
      !heading.closest('nav, pre, svg, .mermaid, [hidden]') && heading.innerText.trim()
    );
    if (!headings.length) return;

    menu = document.createElement('details');
    menu.className = 'paper-article-outline';
    const summary = document.createElement('summary');
    summary.textContent = '本文目录';
    const list = document.createElement('ol');
    menu.append(summary, list);

    const bookNav = article.querySelector(':scope > .paper-book-nav');
    const bookTitle = bookNav?.querySelector('.paper-book-title');
    if (bookTitle) {
      bookTitle.append(menu);
    } else {
      standaloneNav = document.createElement('nav');
      standaloneNav.className = 'paper-article-nav';
      standaloneNav.setAttribute('aria-label', '文章导航');
      standaloneNav.append(menu);
      article.prepend(standaloneNav);
    }
    const toolbar = standaloneNav || bookNav;
    const parents = [];
    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      while (parents.length && parents.at(-1).level >= level) parents.pop();
      const parent = parents.at(-1);
      if (parent && !parent.list) {
        parent.list = document.createElement('ol');
        parent.item.append(parent.list);
      }
      const item = document.createElement('li');
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.textContent = heading.innerText.trim().replace(/\s+/g, ' ');
      jump.addEventListener('click', () => {
        menu.open = false;
        // Opening a menu near the end of a long document can trigger scroll anchoring.
        // Measure the sticky bar after closing the menu so the heading stays visible.
        for (let ancestor = heading.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (ancestor.tagName === 'DETAILS') ancestor.open = true;
        }
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        window.scrollBy(0, heading.getBoundingClientRect().top - toolbar.offsetHeight - 8);
      });
      item.append(jump);
      (parent?.list || list).append(item);
      parents.push({ level, item });
    }
  }

  document.addEventListener('click', event => {
    if (menu?.open && !menu.contains(event.target)) menu.open = false;
  }, { signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu?.open) {
      event.preventDefault();
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  }, { signal });

  window.addEventListener('vscode.markdown.updateContent', refresh, { signal });
  // VS Code can insert its initial Markdown body after the webview's load event.
  const initialContent = new MutationObserver(() => {
    if (document.querySelector('.markdown-body')) {
      initialContent.disconnect();
      refresh();
    }
  });
  window.__paperArticleOutline = { dispose() { lifetime.abort(); initialContent.disconnect(); removeMenu(); } };
  if (document.querySelector('.markdown-body')) refresh();
  else initialContent.observe(document.documentElement, { childList: true, subtree: true });
})();
