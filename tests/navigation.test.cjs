const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
  class Uri { constructor(file){this.fsPath=file;this.scheme='file';}static file(file){return new Uri(file);} }
  const file=path.join(path.parse(process.cwd()).root,'books','one','01.md'),uri=new Uri(file);
  const book={root:path.dirname(file),title:'Book',chapters:[{file,title:'One'},{file:path.join(path.dirname(file),'02.md'),title:'Two'}]};
  const commands={},calls=[],events={},oldLayout={orientation:0,groups:[{size:1}]},state=new Map();
  const config={get:(k,d)=>k==='libraryRoots'?[path.dirname(book.root)]:d};
  const api={Uri,ViewColumn:{One:1},StatusBarAlignment:{Left:1},ConfigurationTarget:{Global:1},
    commands:{registerCommand:(id,fn)=>{commands[id]=fn;return{};},executeCommand:async(id,...args)=>{calls.push([id,...args]);if(id==='vscode.getEditorLayout')return oldLayout;}},
    window:{activeTextEditor:{document:{uri,languageId:'markdown'},viewColumn:2},createStatusBarItem:()=>({show(){},hide(){}}),onDidChangeActiveTextEditor:fn=>{events.active=fn;return{};},showTextDocument:async(document,options)=>{calls.push(['showSource',document.uri.fsPath,options]);},showErrorMessage:e=>{throw new Error(e);},setStatusBarMessage(){}},
    workspace:{workspaceFolders:[],getConfiguration:()=>config,openTextDocument:async uri=>({uri,languageId:'markdown'}),onDidSaveTextDocument:()=>({}),onDidChangeConfiguration:()=>({})}};
  const index={findBookRoot:()=>book.root,buildBook:()=>book,position:(b,f)=>b.chapters.findIndex(c=>c.file===f),neighbour:(b,f,n)=>b.chapters[b.chapters.findIndex(c=>c.file===f)+n],shelf:()=>[],inside:()=>true,navHTML:()=>({top:'<nav>',bottom:'</nav>'})};
  const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extensions/paper-writing/navigation.js'),'utf8'),{module,require:id=>id==='vscode'?api:id==='./book-index'?index:require(id)});
  const exported=module.exports.registerNavigation({subscriptions:[],globalState:{get:k=>state.get(k),update:async(k,v)=>state.set(k,v)}});
  return {commands,calls,uri,book,events,exported,oldLayout};
}
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
