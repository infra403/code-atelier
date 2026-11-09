const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {planMark,PALETTES}=require('../extensions/paper-writing/marking');
function harness(pick) {
  const commands={},messages=[],settings={textColor:'terracotta',highlightColor:'yellow'};let pickerCalls=0;
  class Uri {constructor(s){this.s=s}toString(){return this.s}static joinPath(base,...path){return new Uri(base+'/'+path.join('/'))}}
  class Range {constructor(start,end){this.start=start;this.end=end}}
  class Selection extends Range {constructor(a,b){super(Math.min(a,b),Math.max(a,b));this.isReversed=a>b}}
  const document={languageId:'markdown',uri:new Uri('file:///sample.md'),version:1,isClosed:false,getText:()=> '前重点后',offsetAt:x=>x,positionAt:x=>x};
  const editor={document,selections:[new Selection(1,3)],edits:[],async edit(builder){builder({replace:(range,text)=>editor.edits.push({range,text})});return true;}};
  const api={Uri,Range,Selection,ThemeIcon:class{},ConfigurationTarget:{Global:1},workspace:{getConfiguration:()=>({get:key=>settings[key],update:async(key,value)=>{settings[key]=value}})},QuickPickItemKind:{Separator:-1},window:{activeTextEditor:editor,visibleTextEditors:[editor],showInformationMessage:message=>messages.push(message),setStatusBarMessage(){},showQuickPick:async items=>{pickerCalls++;return pick({items,document,editor,api})}},commands:{registerCommand:(id,f)=>(commands[id]=f,{dispose(){}})}};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../extensions/paper-writing/extension.js','utf8'),{module,require:id=>id==='vscode'?api:id==='./navigation'?{registerNavigation(){}}:{planMark,PALETTES}});
  module.exports.activate({subscriptions:[],extensionUri:new Uri('file:///extension'),globalState:{get(){},async update(){}}});
  return {commands,editor,messages,settings,get pickerCalls(){return pickerCalls}};
}
test('A and pen apply configured colors without opening any picker',async()=>{
  const h=harness(()=>{throw Error('Picker must not open')});
  h.settings.textColor='blue';h.settings.highlightColor='rose';
  await h.commands['paperWriting.toggleColor']();
  assert.equal(h.editor.edits[0].text,'<span style="color:#365f82">重点</span>');
  h.editor.selections=[{start:1,end:3,isReversed:false}];
  await h.commands['paperWriting.toggleHighlight']();
  assert.equal(h.editor.edits[1].text,'<mark style="background-color:#f6e2e8;color:inherit">重点</mark>');
  assert.equal(h.pickerCalls,0);
});
test('palette config is saved and affects the next click without modifying text itself',async()=>{
  const h=harness(({items})=>items.find(item=>item.family==='color'&&item.colorId==='sage'));
  await h.commands['paperWriting.paletteSettings']();
  assert.equal(h.settings.textColor,'sage');assert.equal(h.editor.edits.length,0);
  await h.commands['paperWriting.toggleColor']();
  assert.equal(h.editor.edits[0].text,'<span style="color:#42654a">重点</span>');assert.equal(h.pickerCalls,1);
});
test('canceling settings changes neither colors nor text',async()=>{
  const h=harness(()=>undefined);await h.commands['paperWriting.paletteSettings']();
  assert.equal(h.settings.textColor,'terracotta');assert.equal(h.editor.edits.length,0);
});
test('a document changed while more-marks menu is open is not edited',async()=>{
  const h=harness(({items,document})=>{document.version++;return items[0]});
  await h.commands['paperWriting.moreMarks']();assert.equal(h.editor.edits.length,0);assert.equal(h.messages.length,1);
});
