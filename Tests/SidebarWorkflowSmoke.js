// End-to-end browser/controller smoke via fake WKWebView + actual app.js.
// CI-only Node.js. No Node/npm dependencies on the installed Mac.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("LabelDesk/Resources/app.js","utf8");
const html = fs.readFileSync("LabelDesk/Resources/app.html","utf8");
const uuid = n => "00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const base = {
  schemaVersion:1,id:uuid(1),folderID:uuid(10),name:"Базовый товар",
  widthMM:58,heightMM:38,gapMM:2,updatedAt:"2026-11-16T12:00:00Z",
  elements:[
    {id:uuid(100),kind:"text",xMM:2,yMM:2,widthMM:20,heightMM:5,value:"Старое",isVariable:true,fieldName:"Название"},
    {id:uuid(101),kind:"barcode",barcodeType:"CODE128",xMM:0,yMM:12,widthMM:55,heightMM:13,
      value:"123456",isVariable:true,fieldName:"ШК",showsHumanReadable:true}
  ]
};
const secondary = {...JSON.parse(JSON.stringify(base)),id:uuid(2),name:"Вариант",updatedAt:"2026-11-15T12:00:00Z"};
const firstFolder = {id:uuid(10),name:"Продукты",baseTemplateID:base.id,createdAt:"2026-11-15T12:00:00Z"};
const store = {
  templates:[JSON.parse(JSON.stringify(base)),JSON.parse(JSON.stringify(secondary))],
  folders:[JSON.parse(JSON.stringify(firstFolder))],
  settings:{schemaVersion:1,snapToGrid:true,profile:{
    portPath:"/dev/cu.usbserial-1430",rasterThreshold:128,labelIntervalSeconds:1.5,
    mediaWidthMM:58,mediaHeightMM:38,mediaGapMM:2}},
  queue:[],printJobs:[]
};
const copy = o => JSON.parse(JSON.stringify(o));
const elements = new Map();
class FakeElement {
  constructor(id) {
    this.id=id;this.value="";this.innerHTML="";this.textContent="";
    this.disabled=false;this.style={};this.listeners=new Map();
  }
  addEventListener(type,handler) {this.listeners.set(type,handler);}
  removeAttribute(name){this[name]=undefined;}
  fire(type,event={}){const handler=this.listeners.get(type);assert.ok(handler,"No listener: "+this.id+" "+type);return handler({target:this,...event});}
}
function element(id) {
  if(!elements.has(id))elements.set(id,new FakeElement(id));
  return elements.get(id);
}
const frame = {postMessage(message){frame.last=message;}};
element("editorFrame").contentWindow=frame;
element("quickCopies").value="1";
const bodyListeners = new Map();
const document = {
  getElementById:element,
  querySelectorAll:()=>[],
  body:{addEventListener:(type,handler)=>bodyListeners.set(type,handler)}
};
const prompts = [];
const log=[];
let failNextFolderSave = false;
const window = {
  confirm:()=>true,
  prompt:()=>prompts.shift()??null,
  addEventListener:(type,handler)=>{window.listeners.set(type,handler);},
  listeners:new Map(),
  webkit:{messageHandlers:{labelDesk:{postMessage(request) {
    const {id,action,data={}}=request;
    try{
      let result=true;
      switch(action){
      case "loadAll":
        result={templates:copy(store.templates),folders:copy(store.folders),settings:copy(store.settings),
          queue:copy(store.queue),runtimePath:"/tmp/test/live"};break;
      case "ports":result=["/dev/cu.usbserial-1430"];break;
      case "initPrinter":
        assert.equal(data.pitchMM,40,"Default roll must retain ESC q040");
        break;
      case "saveTemplate":{
        const doc=JSON.parse(data.document);
        assert.ok(doc.id&&Array.isArray(doc.elements));
        const pos=store.templates.findIndex(t=>t.id.toLowerCase()===doc.id.toLowerCase());
        if(pos<0)store.templates.push(doc);else store.templates[pos]=doc;
        break;
      }
      case "deleteTemplate":
        store.templates=store.templates.filter(t=>t.id.toLowerCase()!==data.id.toLowerCase());
        break;
      case "saveData":{
        if(data.key==="folders"&&failNextFolderSave){
          failNextFolderSave=false;throw Error("Simulated disk write error");
        }
        store[data.key]=JSON.parse(data.json);
        break;
      }
      case "printJob":
        store.printJobs.push(copy(data));result={output:"mock serial sent"};break;
      case "cancelPrint":break;
      default:throw Error("Unknown native action "+action);
      }
      log.push(action);
      window.labelDeskReceive({id,result});
    }catch(err){window.labelDeskReceive({id,error:err.message});}
  }}}}
};
const EZ2Raster = {
  mediaFromProfile:p=>({widthMM:+(p.mediaWidthMM??58),heightMM:+(p.mediaHeightMM??38),gapMM:+(p.mediaGapMM??2)}),
  compatibility:(doc,media)=>{
    if(!doc)return {ok:false,reason:"Нет макета"};
    const ok=doc.widthMM===media.widthMM&&doc.heightMM===media.heightMM&&doc.gapMM===media.gapMM;
    return {ok,reason:ok?"":"Несовместимые размеры"};
  },
  transportReady:m=>m.gapMM>=1,
  labelPitch:m=>m.heightMM+m.gapMM,
  draw:()=>({toDataURL:()=>"data:image/png;base64,AA=="}),
  encode:()=>({base64:"QUJDREVGRw==",widthBytes:10,rows:280,size:4000}),
  validateMedia:m=>m
};
let sequence=1000;
const crypto={randomUUID:()=>uuid(sequence++)};
const context={window,document,crypto,EZ2Raster,Date,console,Number,String,Object,Array,
  setTimeout,Uint8Array,Math};
vm.runInNewContext(source,context,{filename:"LabelDesk/Resources/app.js"});
async function settle(){await new Promise(resolve=>setTimeout(resolve,0));}
function click(kind,value,extra={}){
  const attr="[data-"+kind+"]";
  const key=kind.replace(/-([a-z])/g,(_m,ch)=>ch.toUpperCase());
  const target={closest:selector=>selector===attr?{dataset:{[key]:value,...extra}}:null};
  return bodyListeners.get("click")({target});
}
function trigger(id,type="click",event){return element(id).fire(type,event);}
function assertExistsName(name){assert.ok(store.templates.some(t=>t.name===name),"Missing template "+name);}
(async()=>{
  await settle();
  assert.ok(html.includes('id="folderDetail"')&&html.includes('id="templateDetail"'));
  assert.ok(!html.includes('data-view="quick"'),"Quick Fill must not be a navigation section");
  assert.match(element("folders").innerHTML,/Все шаблоны/);
  assert.equal(store.folders.length,1);
  assert.equal(store.templates.length,2);

  // Folder selection shows the main label list, not an arbitrary first editor.
  await click("folder",firstFolder.id);
  assert.match(element("topTitle").textContent,/Редактор этикеток/);
  assert.match(element("templates").innerHTML,/Базовый товар/);
  assert.match(element("templates").innerHTML,/Вариант/);
  assert.equal(element("editorWorkspace").hidden,true);
  assert.equal(element("editorLibrary").hidden,false);
  assert.match(html,/id="templates" class="template-main-list"/);
  assert.ok(!html.includes('id="dishList"></div>\n  </div>'),"Record list must not be in sidebar");

  // A new folder is PURE STORAGE: it must NOT clone or save a hidden base.
  const before=store.templates.length;
  prompts.push("Холодильник");
  await trigger("addFolder");
  assert.equal(store.folders.length,2);
  assert.equal(store.templates.length,before);
  const created=store.folders.find(f=>f.name==="Холодильник");
  assert.ok(created);
  assert.equal(created.baseTemplateID,undefined,"New folders have no mandatory base");
  assert.match(element("templates").innerHTML,/нет этикеток/);

  // Save a new label in this folder; it is editable, movable and deletable.
  await trigger("newTemplateMain");
  assert.equal(element("editorWorkspace").hidden,false);
  await trigger("saveTemplate");
  const label=store.templates.find(t=>t.folderID===created.id);
  assert.ok(label);
  assert.equal(label.name,"Новая этикетка");

  // Draft guard still works for real edits.
  const edited=copy(label);edited.name="Несохранённый заголовок";
  window.listeners.get("message")({source:frame,
    data:{source:"labeldesk-editor",type:"document",json:JSON.stringify(edited)}});
  assert.match(element("editorContext").textContent,/Не сохранён/);
  window.confirm=()=>false;
  await click("folder",firstFolder.id);
  assert.match(element("editorContext").textContent,/Несохранённый заголовок/);
  window.confirm=()=>true;
  await click("folder",firstFolder.id);

  // Direct folder-row actions, no nested "base" selector or hidden menu.
  prompts.push("Новая полка");
  await click("folder-action","rename",{folderId:created.id});
  assert.ok(store.folders.some(f=>f.name==="Новая полка"));
  await click("folder",created.id);
  await click("template-move",label.id);
  assert.match(element("templates").innerHTML,/data-move-to="unfiled"/);
  await click("move-to","unfiled",{templateId:label.id});
  assert.equal(store.templates.find(t=>t.id===label.id).folderID,null);
  assert.match(element("notify").textContent,/перемещён|перемещена/i);

  // Delete the old folder directly; its templates are preserved as unfiled.
  const countBefore=store.templates.length;
  await click("folder-action","delete",{folderId:firstFolder.id});
  assert.equal(store.folders.some(f=>f.id===firstFolder.id),false);
  assert.equal(store.templates.length,countBefore);
  assert.equal(store.templates.find(t=>t.id===base.id).folderID,null);
  assert.equal(store.templates.find(t=>t.id===secondary.id).folderID,null);

  // Even a formerly starred "base template" can be edited/deleted.
  await click("folder","all");
  await click("template-remove",base.id);
  assert.equal(store.templates.some(t=>t.id===base.id),false);
  assert.ok(store.templates.some(t=>t.id===secondary.id));

  // Search stays in the main list; folder selection controls the scope.
  element("templateSearch").value="Вариант";
  await trigger("templateSearch","input");
  assert.match(element("templates").innerHTML,/Вариант/);
  element("templateSearch").value="";
  await trigger("templateSearch","input");

  // File-write error must never create an orphaned folder or copied label.
  const beforeFolder=store.folders.length,beforeTemplates=store.templates.length;
  prompts.push("Сбойная папка");
  failNextFolderSave=true;
  await trigger("addFolder");
  assert.equal(store.folders.length,beforeFolder);
  assert.equal(store.templates.length,beforeTemplates);
  assert.match(element("notify").textContent,/Не удалось создать папку/);
  assert.ok(log.includes("saveTemplate")&&log.includes("saveData"));
  // Save margins via the actual settings handler and confirm persisted JSON,
  // input round-trip and compatibility with all other profile fields.
  element("marginLeft").value="3";element("marginRight").value="4";
  await trigger("saveMarginSettings");
  assert.equal(store.settings.profile.marginLeftMM,3);
  assert.equal(store.settings.profile.marginRightMM,4);
  assert.equal(store.settings.profile.portPath,"/dev/cu.usbserial-1430");
  assert.equal(element("marginLeft").value,3);
  assert.equal(element("marginRight").value,4);
  element("marginLeft").value="16";
  await trigger("saveMarginSettings");
  assert.equal(store.settings.profile.marginLeftMM,3,"Invalid margins must not be saved");
  assert.match(element("notify").textContent,/Отступы/);

  console.log("Sidebar workflow passed: pure folders, direct rename/delete, template edit/move/delete, draft guard, rollback.");
})().catch(err=>{console.error(err);process.exitCode=1;});
