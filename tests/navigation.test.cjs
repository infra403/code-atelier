const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness({auto = false, inBook = true, legacy = false} = {}){
  class Uri { constructor(file){this.fsPath=file;this.scheme='file';}static file(file){return new Uri(file);} }
  const file=path.join(path.parse(process.cwd()).root,'books','one','01.md'),uri=new Uri(file);
  const book={root:path.dirname(file),title:'Book',chapters:[{file,title:'One'},{file:path.join(path.dirname(file),'02.md'),title:'Two'}]};
  const commands={},calls=[],events={},oldLayout={orientation:0,groups:[{size:1}]},state=new Map();
  class TabInputText { constructor(uri) { this.uri = uri; } }
  const activeTabGroup = {viewColumn:1,activeTab:{input:legacy?{viewType:'mainThreadWebview-markdown.preview'}:new TabInputText(uri)}};
  let layout = oldLayout;
  const subscriptions=[],statusBars=[];
  const config={get:(k,d)=>k==='libraryRoots'?[path.dirname(book.root)]:k==='autoOpenReadingMode'?auto:d};
  const api={Uri,TabInputText,ViewColumn:{One:1,Two:2},StatusBarAlignment:{Left:1},ConfigurationTarget:{Global:1},
    commands:{registerCommand:(id,fn)=>{commands[id]=fn;return{};},executeCommand:async(id,...args)=>{calls.push([id,...args]);if(id==='vscode.getEditorLayout')return layout; if(id==='vscode.setEditorLayout')layout=args[0]; if(id==='markdown.showSource'){ const document={uri,languageId:'markdown'}; await api.window.showTextDocument(document,{viewColumn:1}); }}},
    window:{visibleTextEditors:[],tabGroups:{activeTabGroup,all:[activeTabGroup],onDidChangeTabs:fn=>{events.tabs=fn;return{};},onDidChangeTabGroups:fn=>{events.groups=fn;return{};}},activeTextEditor:legacy?undefined:{document:{uri,languageId:'markdown'},viewColumn:2},createStatusBarItem:()=>({show(){},hide(){}}),onDidChangeActiveTextEditor:fn=>{events.active=fn;return{};},showTextDocument:async(document,options)=>{calls.push(['showSource',document.uri.fsPath,options]); api.window.activeTextEditor={document,viewColumn:options.viewColumn}; activeTabGroup.activeTab={input:new TabInputText(document.uri)}; api.window.visibleTextEditors=[api.window.activeTextEditor];},showErrorMessage:e=>{throw new Error(e);},setStatusBarMessage(){}},
    workspace:{workspaceFolders:[],getConfiguration:()=>config,openTextDocument:async uri=>({uri,languageId:'markdown'}),onDidSaveTextDocument:()=>({}),onDidChangeConfiguration:()=>({})}};
  const index={collectionEntry:()=>null,findBookRoot:()=>inBook?book.root:null,buildBook:()=>book,position:(b,f)=>b.chapters.findIndex(c=>c.file===f),neighbour:(b,f,n)=>b.chapters[b.chapters.findIndex(c=>c.file===f)+n],shelf:()=>[],inside:()=>true,navHTML:()=>({top:'<nav>',bottom:'</nav>'})};
  const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extensions/paper-writing/navigation.js'),'utf8'),{module,clearTimeout,setTimeout,require:id=>id==='vscode'?api:id==='./book-index'?index:require(id)});
  api.window.createStatusBarItem=()=>{const item={show(){this.visible=true;},hide(){this.visible=false;}};statusBars.push(item);return item;};
  const exported=module.exports.registerNavigation({subscriptions,globalState:{get:k=>state.get(k),update:async(k,v)=>state.set(k,v)}});
  return {commands,calls,uri,book,events,exported,oldLayout,api,subscriptions,statusBars,collapse:()=>{layout=oldLayout;}};
}
test('book search remains available without an active book and has a discoverable command',()=>{
  const h=harness({inBook:false});
  assert.equal(typeof h.commands['paperWriting.searchBooks'],'function');
  const visible=h.statusBars.filter(b=>b.visible);
  assert.equal(visible.length,1);
  assert.equal(visible[0].command,'paperWriting.searchBooks');
  assert.match(visible[0].text,/搜索书籍/);
});
test('reading mode creates source-left/preview-right layout and restores the prior layout',async()=>{
  const h=harness();await h.commands['paperWriting.readingMode'](h.uri);
  const layout=h.calls.find(c=>c[0]==='vscode.setEditorLayout')[1];
  assert.equal(layout.groups.length,2);assert.equal(layout.groups[0].size,0.4);
  assert.equal(h.calls.find(c=>c[0]==='showSource')[2].viewColumn,1);
  assert.ok(h.calls.some(c=>c[0]==='markdown.showPreviewToSide'&&c[1]===h.uri));
  await h.commands['paperWriting.readingMode']();
  assert.equal(h.calls.filter(c=>c[0]==='vscode.setEditorLayout').at(-1)[1],h.oldLayout);
});
test('next chapter reuses reading layout and opens matching source and preview',async()=>{
  const h=harness();await h.commands['paperWriting.readingMode'](h.uri);
  await h.commands['paperWriting.nextChapter'](h.uri);
  assert.equal(h.calls.filter(c=>c[0]==='showSource').at(-1)[1],h.book.chapters[1].file);
  assert.equal(h.calls.filter(c=>c[0]==='showSource').at(-1)[2].viewColumn,1);
  assert.equal(h.calls.filter(c=>c[0]==='markdown.showPreviewToSide').at(-1)[1].fsPath,h.book.chapters[1].file);
  assert.equal(h.calls.filter(c=>c[0]==='vscode.setEditorLayout').length,1);
});
test('preview extension wraps rendered output without changing the document source',()=>{
  const h=harness(),md={renderer:{render:()=>'<p>Original</p>'}};
  h.exported.extendMarkdownIt(md);
  assert.equal(md.renderer.render([],{}, {currentDocument:h.uri}),'<nav><p>Original</p></nav>');
});

test('opening a standalone Markdown source automatically pairs a preview without taking focus',async()=>{
  const h=harness({auto:true,inBook:false});
  await new Promise(resolve=>setTimeout(resolve,180));
  const call=h.calls.find(c=>c[0]==='vscode.openWith');
  assert.equal(call[1],h.uri);
  assert.equal(call[2],'vscode.markdown.preview.editor');
  assert.equal(call[3].preserveFocus,true);
  assert.equal(call[3].viewColumn,2);
});
test('opening a source with auto-reading off stays in its existing layout',async()=>{
  const h=harness();h.events.active(h.api.window.activeTextEditor);
  await new Promise(resolve=>setTimeout(resolve,180));
  assert.ok(!h.calls.some(c=>c[0]==='vscode.openWith'||c[0]==='vscode.setEditorLayout'));
});

// Restored legacy previews have no URI on TabInputWebview and no activeTextEditor.
test('a restored native legacy preview automatically recovers the matching source and split',async(t)=>{
  const h=harness({auto:true,legacy:true});
  t.after(()=>h.subscriptions.forEach(s=>s.dispose?.()));
  await new Promise(resolve=>setTimeout(resolve,240));
  assert.ok(h.calls.some(c=>c[0]==='showSource'&&c[1]===h.uri.fsPath&&c[2].viewColumn===1));
  assert.ok(h.calls.some(c=>c[0]==='vscode.openWith'&&c[1].fsPath===h.uri.fsPath&&c[3].viewColumn===2));
});
test('next chapter recreates two columns if the reading layout was collapsed',async()=>{
  const h=harness();await h.commands['paperWriting.readingMode'](h.uri);
  h.collapse();
  await h.commands['paperWriting.nextChapter'](h.uri);
  assert.equal(h.calls.filter(c=>c[0]==='vscode.setEditorLayout').length,2);
});
test('next chapter uses the focused preview rather than a different background render',async()=>{
  const h=harness();
  h.api.window.activeTextEditor=undefined;
  h.api.window.tabGroups.activeTabGroup.activeTab={input:{viewType:'vscode.markdown.preview.editor',uri:h.uri}};
  const md={renderer:{render:()=>''}};h.exported.extendMarkdownIt(md);
  md.renderer.render([],{}, {currentDocument:h.api.Uri.file(h.book.chapters[1].file)});
  await h.commands['paperWriting.nextChapter']();
  assert.equal(h.calls.find(c=>c[0]==='showSource')?.[1],h.book.chapters[1].file);
});
