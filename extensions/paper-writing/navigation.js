'use strict';
const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs');
const { buildBook, buildCollection, collectionEntry, findBookRoot, shelf, clearDiscoveryCache, position, neighbour, chapterRows, navHTML, inside } = require('./book-index');

function registerNavigation(context) {
  const cache = new Map();
  let shelfCache, lastRendered, lastSource, sourceColumn = vscode.ViewColumn.One, readingMode = false, previousLayout, moving = false;
  const previewEditor = 'vscode.markdown.preview.editor';
  let autoTimer, suppressedFile, legacyPreviewFile;
  const settings = () => vscode.workspace.getConfiguration('paperWriting');
  const workspaceRoots = () => (vscode.workspace.workspaceFolders || []).filter(f=>f.uri.scheme==='file').map(f=>f.uri.fsPath);
  const libraries = () => settings().get('libraryRoots', []).map(p=>path.resolve(p));
  function bookFor(uri) {
    if (!settings().get('readingNavigation',true) || uri?.scheme !== 'file') return null;
    const root = findBookRoot(uri.fsPath, libraries(), workspaceRoots());
    const home = collectionEntry(uri.fsPath,libraries());
    const overview = !root && home === uri.fsPath;
    if (!root && !overview) return null;
    const key=overview?`collection:${home}`:root;
    let record = cache.get(key);
    if (!record || Date.now()-record.time > 30000) {
      const book=overview?buildCollection(path.dirname(home)):buildBook(root,{separateBooks:true});
      if(!overview && home && path.dirname(home)!==root)book.collectionEntry=home;
      record = {time:Date.now(),book};cache.set(key,record);
    }
    return record.book.chapters.length ? record.book : null;
  }
  function books() {
    if (!shelfCache || Date.now()-shelfCache.time > 30000) shelfCache = {time:Date.now(),books:shelf(libraries())};
    return shelfCache.books;
  }
  function current(resource) {
    if (resource instanceof vscode.Uri && resource.scheme === 'file') return resource;
    const selected = activeMarkdown();
    if (selected) return selected;
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'markdown') return editor.document.uri;
    return lastRendered || lastSource;
  }
  const bars = ['previousChapter','chooseChapter','nextChapter','searchBooks','readingMode'].map((command,i)=> {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 45-i);
    item.command = `paperWriting.${command}`; context.subscriptions.push(item); return item;
  });
  function update(uri = current()) {
    const book = bookFor(uri), at = book ? position(book,uri.fsPath) : -1;
    vscode.commands.executeCommand('setContext','paperWriting.hasBook',!!book);
    bars[3].text='$(search) 搜索书籍'; bars[3].tooltip='按书名、合集或目录搜索，继续上次阅读';
    if (!book) { bars.forEach(b=>b.hide()); if(libraries().length)bars[3].show(); return; }
    const previous = neighbour(book,uri.fsPath,-1), next = neighbour(book,uri.fsPath,1);
    bars[0].text='$(chevron-left) 上一章'; bars[0].tooltip=previous?.title || '已到第一章';
    bars[1].text=`$(book) ${at<0?'导读':at+1} / ${book.chapters.length}`; bars[1].tooltip=`${book.title} · 选择章节`;
    if(book.isCollection)bars[1].text=`$(list-tree) ${book.bookCount} 册 · ${book.chapters.length} 章`;
    bars[2].text='下一章 $(chevron-right)'; bars[2].tooltip=next?.title || '已到全书末章';
    bars[4].text=readingMode?'$(layout) 退出阅读':'$(open-preview) 阅读模式';bars[4].tooltip='一键排版：左侧划词标记，右侧阅读';
    bars.forEach(b=>b.show());
    if(book.isCollection){bars[0].hide();bars[2].hide();}
  }
  function matchingPreview(uri) {
    const group = vscode.window.tabGroups.all.find(group => group.viewColumn === vscode.ViewColumn.Two);
    const input = group?.activeTab?.input;
    return (input?.viewType === previewEditor && input.uri?.fsPath === uri.fsPath)
      || (legacyPreviewFile === uri.fsPath && input?.viewType?.endsWith('markdown.preview'));
  }

  function activeMarkdown() {
    const group = vscode.window.tabGroups.activeTabGroup;
    const input = group.activeTab?.input;
    if (input?.uri?.scheme !== 'file') return;
    const editor = vscode.window.activeTextEditor;
    if (input instanceof vscode.TabInputText && editor?.document.languageId === 'markdown'
        && editor.document.uri.fsPath === input.uri.fsPath) return input.uri;
    if (input.viewType === previewEditor) return input.uri;
  }

  function isLegacyPreview(tab) {
    return tab?.input?.viewType?.endsWith('markdown.preview');
  }

  async function pairActive() {
    let legacyTab;
    if (isLegacyPreview(vscode.window.tabGroups.activeTabGroup.activeTab)) {
      // Restored Webview tabs have no URI. Ask the native preview to reveal its
      // actual source rather than guessing from a different background render.
      legacyTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      moving = true;
      try { await vscode.commands.executeCommand('markdown.showSource'); }
      finally { moving = false; }
    }
    const uri = activeMarkdown();
    if (!uri || uri.fsPath === suppressedFile) return;
    suppressedFile = undefined;
    const left = vscode.window.visibleTextEditors.find(e => e.viewColumn === vscode.ViewColumn.One);
    if (readingMode && left?.document.uri.fsPath === uri.fsPath && matchingPreview(uri)) return;
    await showPair(uri, true, legacyTab);
  }

  async function showPair(uri, automatic = false, legacyTab) {
    moving = true;
    try {
      const layout = await vscode.commands.executeCommand('vscode.getEditorLayout');
      if (!readingMode) previousLayout = layout;
      if (automatic && activeMarkdown()?.fsPath !== uri.fsPath) return;
      if (layout.groups.length === 1 || (layout.groups.length === 2 && layout.orientation !== 0)
          || (!automatic && !readingMode)) {
        const ratio = settings().get('readingEditorRatio', 0.4);
        await vscode.commands.executeCommand('vscode.setEditorLayout', {orientation:0, groups:[{size:ratio}, {size:1-ratio}]});
      }
      if (!readingMode) await vscode.commands.executeCommand('setContext','paperWriting.readingMode',true);
      readingMode = true;
      sourceColumn = vscode.ViewColumn.One;
      const doc = await vscode.workspace.openTextDocument(uri);
      const requested = automatic && activeMarkdown();
      if (requested && requested.fsPath !== uri.fsPath) return;
      const group = vscode.window.tabGroups.activeTabGroup;
      const displacedSource = group.viewColumn === vscode.ViewColumn.Two
        && group.activeTab?.input instanceof vscode.TabInputText
        && group.activeTab.input.uri.fsPath === uri.fsPath ? group.activeTab : undefined;
      if (automatic && group.viewColumn === sourceColumn && group.activeTab?.input.viewType === previewEditor
          && group.activeTab.input.uri.fsPath === uri.fsPath) {
        await vscode.commands.executeCommand('markdown.reopenAsSource');
      }
      const active = vscode.window.activeTextEditor;
      if (active?.document !== doc || active.viewColumn !== sourceColumn) {
        await vscode.window.showTextDocument(doc, {viewColumn:sourceColumn, preview:true});
      }
      lastSource = uri;
      if (settings().get('autoOpenReadingMode',false)) {
        if (!matchingPreview(uri)) {
          // Open the preview without taking the selection or keyboard focus from the source.
          try {
            await vscode.commands.executeCommand('vscode.openWith',uri,previewEditor,
              {viewColumn:vscode.ViewColumn.Two, preserveFocus:true, preview:true});
          } catch {
            await vscode.commands.executeCommand('markdown.showPreviewToSide',uri);
            legacyPreviewFile = uri.fsPath;
            await vscode.window.showTextDocument(doc, {viewColumn:sourceColumn, preview:true});
          }
        }
      } else {
        await vscode.commands.executeCommand('markdown.showPreviewToSide',uri);
      }
      if (matchingPreview(uri)) {
        // A native Markdown link can first create a temporary source tab on the
        // right. Remove that duplicate only after its source is visible on the left.
        for (const tab of [displacedSource, legacyTab]) {
          if (tab && !tab.isDirty && !tab.isPinned
              && vscode.window.tabGroups.all.some(g => g.tabs?.includes(tab))) {
            await vscode.window.tabGroups.close(tab, true);
          }
        }
      }
      update(uri);
    } finally { moving = false; }
  }

  function scheduleAutoPair() {
    clearTimeout(autoTimer);
    if (!settings().get('autoOpenReadingMode',false)) return;
    autoTimer = setTimeout(() => {
      if (moving) { scheduleAutoPair(); return; }
      void pairActive().catch(e => vscode.window.showErrorMessage('打开阅读分栏失败：' + e.message));
    }, 100);
  }

  async function toggleReadingMode(resource) {
    if(readingMode){
      suppressedFile = lastSource?.fsPath;
      readingMode=false;await vscode.commands.executeCommand('setContext','paperWriting.readingMode',false);
      if(previousLayout)await vscode.commands.executeCommand('vscode.setEditorLayout',previousLayout);
      update();return;
    }
    const uri=current(resource);if(!uri)return chooseBook();
    suppressedFile = undefined;
    await showPair(uri);
  }
  async function open(file) {
    await showPair(vscode.Uri.file(file));
  }
  async function step(offset,resource) {
    const uri=current(resource), book=bookFor(uri); if (!book) return chooseBook();
    if(book.isCollection)return chooseChapter(resource);
    const next=neighbour(book,uri.fsPath,offset);
    if (next) return open(next.file);
    vscode.window.setStatusBarMessage(offset>0?'已到全书最后一章':'已到全书第一章',2500);
  }
  async function chooseChapter(resource) {
    const uri=current(resource), book=bookFor(uri); if (!book) return chooseBook();
    const at=position(book,uri.fsPath);
    const items=chapterRows(book).map(row=>row.type==='group'
      ? {label:'　'.repeat(row.depth)+row.title,kind:vscode.QuickPickItemKind.Separator}
      : {label:`${row.index===at?'$(check) ':' '}${row.index+1}. ${row.chapter.title}`,description:row.breadcrumb,file:row.chapter.file});
    const chosen=await vscode.window.showQuickPick(items, {title:book.title,placeHolder:'输入章节、分册或分类名 · 所有分类默认展开',matchOnDescription:true});
    if(chosen) await open(chosen.file);
  }
  async function addLibrary() {
    const selected=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'添加书库',title:'选择包含多本电子书的文件夹'});
    if(!selected?.[0]) return;
    await settings().update('libraryRoots',[...new Set([...libraries(),selected[0].fsPath])],vscode.ConfigurationTarget.Global);
    shelfCache=null; await chooseBook();
  }
  async function chooseBook() {
    const items=books();
    if(!items.length) return addLibrary();
    const chosen=await vscode.window.showQuickPick(items.map(book=>({label:book.title,description:book.collection!==book.root?path.basename(book.collection)+' / '+path.relative(book.collection,book.root):path.basename(book.root),book})),{title:'纸页书架',placeHolder:'搜索书名或合集 · 自动继续上次阅读',matchOnDescription:true});
    if(!chosen) return;
    // Collections used to store a single bookmark, sometimes several wrappers up.
    const root = chosen.book.root;
    const ancestors = [root];
    for (let dir=path.dirname(root); libraries().some(lib=>inside(lib,dir)) && dir!==path.dirname(dir); dir=path.dirname(dir)) ancestors.push(dir);
    for (const oldRoot of ancestors) {
      const previous = context.globalState.get(`paperReading.last:${oldRoot}`);
      if (!previous) continue;
      const file = path.resolve(oldRoot, previous);
      if (inside(root, file) && fs.existsSync(file) && findBookRoot(file,libraries(),workspaceRoots())===root) return open(file);
    }
    await open(chosen.book.entry);
  }
  const commands={previousChapter:r=>step(-1,r),nextChapter:r=>step(1,r),chooseChapter,chooseBook,searchBooks:chooseBook,addLibrary,readingMode:toggleReadingMode,refreshBooks:()=>{clearDiscoveryCache();cache.clear();shelfCache=null;update();return vscode.commands.executeCommand('markdown.preview.refresh');}};
  for(const [id,fn] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(`paperWriting.${id}`,async(...args)=>{try{return await fn(...args);}catch(e){vscode.window.showErrorMessage(`书架导航：${e.message}`);}}));
  context.subscriptions.push({dispose:() => clearTimeout(autoTimer)});
  context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(event => {
    const active = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (event.opened.includes(active) || event.changed.includes(active)) scheduleAutoPair();
  }));
  context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabGroups(scheduleAutoPair));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor=>{
    scheduleAutoPair();
    if(editor?.document.languageId==='markdown'){
      lastSource=editor.document.uri;
      // Native preview links can open their source in the right-hand group.
      // Keep the reading-mode contract: source left, live preview right.
      if(!settings().get('autoOpenReadingMode',false) && readingMode && !moving && editor.viewColumn!==vscode.ViewColumn.One && bookFor(editor.document.uri)){
        void open(editor.document.uri.fsPath).catch(e=>vscode.window.showErrorMessage(`书架导航：${e.message}`));return;
      }
      if(!readingMode)sourceColumn=editor.viewColumn||vscode.ViewColumn.One;
    }update();
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc=>{if(doc.languageId==='markdown'){clearDiscoveryCache();cache.clear();shelfCache=null;update();}}));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('paperWriting')){scheduleAutoPair();clearDiscoveryCache();cache.clear();shelfCache=null;update();vscode.commands.executeCommand('markdown.preview.refresh');}}));
  if(vscode.window.activeTextEditor?.document.languageId==='markdown'){lastSource=vscode.window.activeTextEditor.document.uri;sourceColumn=vscode.window.activeTextEditor.viewColumn||vscode.ViewColumn.One;}
  update();
  scheduleAutoPair();
  return {
    extendMarkdownIt(md) {
      const render=md.renderer.render.bind(md.renderer);
      md.renderer.render=(tokens,options,env)=>{
        const content=render(tokens,options,env), uri=env?.currentDocument;
        // Native previews can finish restoring after extension activation.
        if (isLegacyPreview(vscode.window.tabGroups.activeTabGroup.activeTab)) scheduleAutoPair();
        try {
          const book=bookFor(uri);if(!book)return content;
          lastRendered=uri;
          if(position(book,uri.fsPath)>=0){const key=`paperReading.last:${book.root}`,value=path.relative(book.root,uri.fsPath);if(context.globalState.get(key)!==value)void context.globalState.update(key,value);}
          update(uri);
          const nav=navHTML(book,uri.fsPath,books());return nav.top+content+nav.bottom;
        } catch {return content;}
      };
      return md;
    }
  };
}
module.exports={registerNavigation};
