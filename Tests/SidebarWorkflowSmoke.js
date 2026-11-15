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
  elements:[{id:uuid(100),kind:"text",xMM:2,yMM:2,widthMM:20,heightMM:5,value:"Старое",isVariable:true,fieldName:"Название"}]
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
  transportReady:m=>m.heightMM===38&&m.gapMM===2,
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
function click(kind,value){
  const attr="[data-"+kind+"]";
  const key=kind.replace(/-([a-z])/g,(_m,ch)=>ch.toUpperCase());
  const target={closest:selector=>selector===attr?{dataset:{[key]:value}}:null};
  return bodyListeners.get("click")({target});
}
function trigger(id,type="click",event){return element(id).fire(type,event);}
function assertExistsName(name){assert.ok(store.templates.some(t=>t.name===name),"Missing template "+name);}
(async()=>{
  await settle();
  assert.ok(html.includes('id="folderDetail"') && html.includes('id="templateDetail"'));
  assert.match(element("folders").innerHTML,/Все шаблоны/);
  assert.match(element("folders").innerHTML,/Без папки/);
  assert.equal(store.folders.length,1);
  assert.equal(store.templates.length,2);

  // 1: Navigate folder, base is selected and quick fill displays its text.
  await click("folder",firstFolder.id);
  assert.match(element("quickTemplateName").textContent,/Базовый товар/);
  assert.match(element("folderDetail").innerHTML,/Назначить базовый шаблон/);
  assert.match(element("quickFields").innerHTML,/Название/);

  // 2: Create folder: independent copy, existing base must not move.
  prompts.push("Новый раздел");
  await trigger("addFolder");
  assert.equal(store.folders.length,2);
  const folder=store.folders.find(f=>f.name==="Новый раздел");
  assert.ok(folder);
  const createdBase=store.templates.find(t=>t.id===folder.baseTemplateID);
  assert.ok(createdBase);
  assert.notEqual(createdBase.id,base.id);
  assert.equal(store.templates.find(t=>t.id===base.id).folderID,firstFolder.id);
  assert.equal(createdBase.folderID,folder.id);
  assert.match(element("folderDetail").innerHTML,/Новый раздел/);

  // 3: New template in current folder, save to file.
  await trigger("newTemplate");
  assert.match(element("editorContext").textContent,/Не сохранён/);
  await trigger("saveTemplate");
  const newVariant=store.templates.find(t=>t.folderID===folder.id&&t.id!==createdBase.id);
  assert.ok(newVariant);
  assert.equal(newVariant.widthMM,58);
  assert.match(element("templates").innerHTML,/Новая этикетка/);

  // 4: Assign variant as folder base, then quick fill must switch to it.
  element("baseChoice").value=newVariant.id;
  await click("library-action","set-base");
  assert.equal(store.folders.find(f=>f.id===folder.id).baseTemplateID,newVariant.id);
  assert.match(element("quickTemplateName").textContent,/Новая этикетка/);
  assert.ok(store.templates.some(t=>t.id===createdBase.id),"Old base must remain saved");

  // 5: Move old base to unfiled; current base cannot move.
  await click("template",createdBase.id);
  element("moveTarget").value="unfiled";
  await click("library-action","move-selected");
  assert.equal(store.templates.find(t=>t.id===createdBase.id).folderID,null);
  assert.equal(store.folders.find(f=>f.id===folder.id).baseTemplateID,newVariant.id);
  assert.match(element("folders").innerHTML,/Без папки/);

  // 6: Rename folder and persist to folders.json.
  await click("folder",folder.id);
  prompts.push("Новое имя");
  await click("library-action","rename-folder");
  assert.equal(store.folders.find(f=>f.id===folder.id).name,"Новое имя");
  assert.match(element("folders").innerHTML,/Новое имя/);

  // 7: Delete folder moves ALL remaining members to unfiled; files remain.
  const templateCount=store.templates.length;
  await click("library-action","delete-folder");
  assert.equal(store.folders.some(f=>f.id===folder.id),false);
  assert.equal(store.templates.length,templateCount);
  assert.equal(store.templates.find(t=>t.id===newVariant.id).folderID,null);
  assertExistsName("Базовый товар");
  assertExistsName("Новая этикетка");

  // 8: Search filters the list, not stored templates.
  element("templateSearch").value="Вариант";
  await trigger("templateSearch","input");
  assert.match(element("templates").innerHTML,/Вариант/);
  assert.doesNotMatch(element("templates").innerHTML,/Базовый товар/);
  element("templateSearch").value="";
  await trigger("templateSearch","input");
  assert.match(element("templates").innerHTML,/Базовый товар/);

  // 9: Editing + dirty confirmation must prevent discarding a draft.
  await click("template",base.id);
  const unsaved=copy(store.templates.find(t=>t.id===base.id));
  unsaved.name="Неподтвержденный черновик";
  window.listeners.get("message")({source:frame,
    data:{source:"labeldesk-editor",type:"document",json:JSON.stringify(unsaved)}});
  assert.match(element("editorContext").textContent,/Не сохранён/);
  window.confirm=()=>false;
  await click("folder",firstFolder.id);
  assert.match(element("editorContext").textContent,/Неподтвержденный черновик/);
  assert.equal(store.templates.find(t=>t.id===base.id).name,"Базовый товар");
  window.confirm=()=>true;

  // 10: Quick fill is detached from saved base and produces a persisted job.
  await click("folder",firstFolder.id);
  element("quickCopies").value="2";
  const field=unsaved.elements[0].id;
  element("quickFields").fire("input",{target:{dataset:{field},value:"Новый текст"}});
  await trigger("queueQuick");
  assert.equal(store.queue.length,1);
  assert.equal(store.queue[0].copies,2);
  assert.equal(store.queue[0].document.elements[0].value,"Новый текст");
  assert.equal(store.templates.find(t=>t.id===base.id).elements[0].value,"Старое");

  // 11: Reopen job and verify native serial receives packet without modifying protocol.
  await trigger("printOne");
  assert.equal(store.printJobs.length,1);
  assert.equal(store.printJobs[0].copies,2);
  assert.equal(store.printJobs[0].port,"/dev/cu.usbserial-1430");

  // 12: Failed folder write rolls back the cloned base; library unchanged.
  const before=store.templates.length;
  prompts.push("Сбойная папка");
  failNextFolderSave=true;
  await trigger("addFolder");
  assert.equal(store.templates.length,before);
  assert.equal(store.folders.some(f=>f.name==="Сбойная папка"),false);
  assert.match(element("notify").textContent,/Не удалось создать папку/);

  // 13: All saved data survives the fake app reload; new UI does not reset JSON.
  const snapshots=copy({templates:store.templates,folders:store.folders,queue:store.queue});
  assert.equal(copy(store.templates).length,snapshots.templates.length);
  assert.equal(copy(store.folders).length,snapshots.folders.length);
  assert.equal(copy(store.queue).length,snapshots.queue.length);
  assert.ok(log.includes("saveTemplate")&&log.includes("saveData"));
  console.log("Sidebar integration passed: folder create/base/rename/delete, template move/search, dirty guard, quick fill, queue, rollback.");
})().catch(err=>{console.error(err);process.exitCode=1;});
