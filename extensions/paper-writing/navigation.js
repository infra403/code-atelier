'use strict';
const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs');
const { buildBook, findBookRoot, shelf, position, neighbour, chapterRows, navHTML, inside } = require('./book-index');

function registerNavigation(context) {
  const cache = new Map();
  let shelfCache, lastRendered, lastSource, sourceColumn = vscode.ViewColumn.One, readingMode = false, previousLayout, moving = false;
  const settings = () => vscode.workspace.getConfiguration('paperWriting');
  const workspaceRoots = () => (vscode.workspace.workspaceFolders || []).filter(f=>f.uri.scheme==='file').map(f=>f.uri.fsPath);
  const libraries = () => settings().get('libraryRoots', []).map(p=>path.resolve(p));
  function bookFor(uri) {
    if (!settings().get('readingNavigation',true) || uri?.scheme !== 'file') return null;
    const root = findBookRoot(uri.fsPath, libraries(), workspaceRoots());
    if (!root) return null;
    let record = cache.get(root);
    if (!record || Date.now()-record.time > 30000) { record = {time:Date.now(),book:buildBook(root)}; cache.set(root,record); }
    return record.book.chapters.length ? record.book : null;
  }
  function books() {
    if (!shelfCache || Date.now()-shelfCache.time > 30000) shelfCache = {time:Date.now(),books:shelf(libraries())};
    return shelfCache.books;
  }
  function current(resource) {
    if (resource instanceof vscode.Uri && resource.scheme === 'file') return resource;
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'markdown') return editor.document.uri;
    return lastRendered || lastSource;
  }
  const bars = ['previousChapter','chooseChapter','nextChapter','chooseBook','readingMode'].map((command,i)=> {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 45-i);
    item.command = `paperWriting.${command}`; context.subscriptions.push(item); return item;
  });
  function update(uri = current()) {
    const book = bookFor(uri), at = book ? position(book,uri.fsPath) : -1;
    vscode.commands.executeCommand('setContext','paperWriting.hasBook',!!book);
    if (!book) { bars.forEach(b=>b.hide()); return; }
    const previous = neighbour(book,uri.fsPath,-1), next = neighbour(book,uri.fsPath,1);
    bars[0].text='$(chevron-left) 上一章'; bars[0].tooltip=previous?.title || '已到第一章';
    bars[1].text=`$(book) ${at<0?'导读':at+1} / ${book.chapters.length}`; bars[1].tooltip=`${book.title} · 选择章节`;
    bars[2].text='下一章 $(chevron-right)'; bars[2].tooltip=next?.title || '已到全书末章';
    bars[3].text='$(library) 书架'; bars[3].tooltip='搜索书籍，继续上次阅读';
    bars[4].text=readingMode?'$(layout) 退出阅读':'$(open-preview) 阅读模式';bars[4].tooltip='一键排版：左侧划词标记，右侧阅读';
    bars.forEach(b=>b.show());
  }
  async function enterReadingMode(uri) {
    moving=true;
    try {
    if(!readingMode){previousLayout=await vscode.commands.executeCommand('vscode.getEditorLayout');readingMode=true;}
    const ratio=settings().get('readingEditorRatio',0.4);
    await vscode.commands.executeCommand('vscode.setEditorLayout',{orientation:0,groups:[{size:ratio},{size:1-ratio}]});
    sourceColumn=vscode.ViewColumn.One;
    await vscode.commands.executeCommand('setContext','paperWriting.readingMode',true);
    const document=await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document,{viewColumn:sourceColumn,preview:true});
    lastSource=uri;
    await vscode.commands.executeCommand('markdown.showPreviewToSide',uri);
    update(uri);
    } finally {moving=false;}
  }
  async function toggleReadingMode(resource) {
    if(readingMode){
      readingMode=false;await vscode.commands.executeCommand('setContext','paperWriting.readingMode',false);
      if(previousLayout)await vscode.commands.executeCommand('vscode.setEditorLayout',previousLayout);
      update();return;
    }
    const uri=current(resource);if(!uri)return chooseBook();
    await enterReadingMode(uri);
  }
  async function open(file) {
    if(!readingMode)return enterReadingMode(vscode.Uri.file(file));
    moving=true;
    try {
    const uri=vscode.Uri.file(file), document=await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document,{viewColumn:sourceColumn,preview:true});
    lastSource=uri;
    await vscode.commands.executeCommand('markdown.showPreviewToSide',uri);
    update(uri);
    } finally {moving=false;}
  }
  async function step(offset,resource) {
    const uri=current(resource), book=bookFor(uri); if (!book) return chooseBook();
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
    const chosen=await vscode.window.showQuickPick(items.map(book=>({label:book.title,description:path.basename(book.root),book})),{title:'纸页书架',placeHolder:'搜索书名 · 自动继续上次阅读',matchOnDescription:true});
    if(!chosen) return;
    const previous=context.globalState.get(`paperReading.last:${chosen.book.root}`);
    const file=previous && path.resolve(chosen.book.root,previous);
    await open(file && inside(chosen.book.root,file) && fs.existsSync(file) ? file : chosen.book.entry);
  }
  const commands={previousChapter:r=>step(-1,r),nextChapter:r=>step(1,r),chooseChapter,chooseBook,addLibrary,readingMode:toggleReadingMode,refreshBooks:()=>{cache.clear();shelfCache=null;update();return vscode.commands.executeCommand('markdown.preview.refresh');}};
  for(const [id,fn] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(`paperWriting.${id}`,async(...args)=>{try{return await fn(...args);}catch(e){vscode.window.showErrorMessage(`书架导航：${e.message}`);}}));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor=>{
    if(editor?.document.languageId==='markdown'){
      lastSource=editor.document.uri;
      // Native preview links can open their source in the right-hand group.
      // Keep the reading-mode contract: source left, live preview right.
      if(readingMode && !moving && editor.viewColumn!==vscode.ViewColumn.One && bookFor(editor.document.uri)){
        void open(editor.document.uri.fsPath).catch(e=>vscode.window.showErrorMessage(`书架导航：${e.message}`));return;
      }
      if(!readingMode)sourceColumn=editor.viewColumn||vscode.ViewColumn.One;
    }update();
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc=>{if(doc.languageId==='markdown'){cache.clear();shelfCache=null;update();}}));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('paperWriting')){cache.clear();shelfCache=null;update();vscode.commands.executeCommand('markdown.preview.refresh');}}));
  if(vscode.window.activeTextEditor?.document.languageId==='markdown'){lastSource=vscode.window.activeTextEditor.document.uri;sourceColumn=vscode.window.activeTextEditor.viewColumn||vscode.ViewColumn.One;}
  update();
  return {
    extendMarkdownIt(md) {
      const render=md.renderer.render.bind(md.renderer);
      md.renderer.render=(tokens,options,env)=>{
        const content=render(tokens,options,env), uri=env?.currentDocument;
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
