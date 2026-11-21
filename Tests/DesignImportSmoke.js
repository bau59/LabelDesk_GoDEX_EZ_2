"use strict";
// Importing an AI-authored design is strictly local, validated and always a NEW template.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const app=fs.readFileSync("LabelDesk/Resources/app.js","utf8");
const html=fs.readFileSync("LabelDesk/Resources/app.html","utf8");
const root={};
const context={window:root,btoa:s=>Buffer.from(s,"binary").toString("base64")};
for(const file of ["barcodes.js","text-engine.js","raster.js"])
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+file,"utf8"),context);
const start=app.indexOf("  const DESIGN_KINDS="),end=app.indexOf("  function designPrompt(){",start);
assert(start>=0&&end>start,"Design parser installed");
let id=0;
const folder="00000000-0000-4000-8000-000000000010";
const state={selectedFolderID:folder};
const raster={draw:()=>({})};
const make=new Function("EZ2Text","EZ2Raster","EZ2Barcodes","uuid","stamp",
  "findFolder","state",app.slice(start,end)+"\nreturn parseDesignJSON;");
const parse=make(root.EZ2Text,raster,root.EZ2Barcodes,
 ()=>"00000000-0000-4000-8000-"+String(++id).padStart(12,"0"),
 ()=>"2026-11-21T12:00:00.000Z",key=>key===folder?{id:folder}:null,state);
const example={
 name:"КОНТРОЛЬ КАЧЕСТВА",widthMM:58,heightMM:30,gapMM:2,printMode:"text",
 elements:[
  {kind:"text",value:"",deviceFont:"A00",fixedRows:9,isVariable:false},
  {kind:"text",value:"Контроль качества пройден",deviceFont:"A03",
   fixedRows:1,textAlignment:"center",isVariable:false},
  {kind:"text",prefix:"Изготовлено: ",dynamicValue:"printDateTime",
   value:"",deviceFont:"A00",fixedRows:1,textAlignment:"center",isVariable:false}
 ]};
const imported=parse(JSON.stringify(example));
assert.equal(imported.schemaVersion,1);
assert.equal(imported.folderID,folder);
assert.equal(imported.printMode,"text");
assert.equal(imported.elements[0].fixedRows,9);
assert.equal(imported.elements[1].value,"Контроль качества пройден");
assert.equal(imported.elements[2].dynamicValue,"printDateTime");
assert.equal(imported.elements[2].isVariable,false);
assert.equal(imported.elements[2].prefix,"Изготовлено: ");
assert.equal(imported.elements.length,3);
assert(imported.id&&imported.elements.every(e=>e.id&&e.id!==imported.id));
assert.equal(imported.updatedAt,"2026-11-21T12:00:00.000Z");
assert.equal(root.EZ2Text.plan(imported).rows.length,11);
const again=parse(JSON.stringify({...example,id:"OLD-ID",folderID:"OLD-FOLDER"}));
assert.notEqual(again.id,imported.id);
assert.equal(again.folderID,folder);
assert.notEqual(again.elements[0].id,imported.elements[0].id);
assert.equal(again.elements[0].value,imported.elements[0].value);
const fenced=String.fromCharCode(96).repeat(3)+"json\n"+
 JSON.stringify(example)+"\n"+String.fromCharCode(96).repeat(3);
assert.equal(parse(fenced).name,example.name);
const fail=(raw,pattern)=>assert.throws(()=>parse(typeof raw==="string"?raw:
 JSON.stringify(raw)),pattern);
fail("no-json",/Ошибка синтаксиса JSON/);
fail(JSON.stringify(example)+" garbage",/Ошибка синтаксиса JSON/);
fail({...example,evil:true},/неизвестное поле «evil»/);
fail({...example,printMode:"invalid"},/printMode/);
fail({...example,widthMM:999},/Ширина/);
fail({...example,gapMM:0},/Зазор/);
fail({...example,heightMM:12.2},/целыми/);
fail({...example,elements:[]},/Количество элементов/);
fail({...example,elements:[{kind:"text",value:"💥",fixedRows:1}]},/CP866/);
fail({...example,elements:[{kind:"text",value:"X".repeat(75),fixedRows:1}]},/строк/);
fail({...example,elements:[{kind:"barcode",barcodeType:"CODE128",value:"ABC"},
 {kind:"text",value:"X",fixedRows:1}]},/последним/);
fail({...example,elements:[{kind:"text",value:"X",fixedRows:1,deviceFont:"A99"}]},/размер/);
fail({...example,elements:[{kind:"text",value:"X",fixedRows:1,
  reversePrint:true,inversePadLeft:13}]},/inversePadLeft/);
fail({...example,elements:[{kind:"text",value:"X",fixedRows:1,
  fakeProperty:10}]},/неизвестное поле/);
const rasterDoc={name:"Растровая проба",widthMM:58,heightMM:30,
 gapMM:2,printMode:"raster",elements:[
  {kind:"text",xMM:3,yMM:3,widthMM:45,heightMM:8,
   value:"Тестовая надпись",fontSize:10,isBold:true},
  {kind:"rectangle",xMM:2,yMM:2,widthMM:50,heightMM:15}]};
const img=parse(JSON.stringify(rasterDoc));
assert.equal(img.printMode,"raster");
assert.equal(img.elements[0].fontSize,10);
assert.equal(img.elements[1].kind,"rectangle");
fail({...rasterDoc,elements:[{kind:"text",value:"X"}]},/требуется xMM/);
fail({...rasterDoc,elements:[{kind:"text",value:"X",xMM:50,yMM:2,
 widthMM:12,heightMM:4}]},/за границ/);
fail({...rasterDoc,elements:[{kind:"rectangle",xMM:0,yMM:0,
 widthMM:58,heightMM:30,src:"https://example.com/picture"}]},/неизвестное поле/);
assert.match(html,/id="openDesignImport"/);
assert.match(html,/id="designImportDialog"/);
assert.match(html,/id="designPromptMode"/);
assert.match(html,/id="designImportJSON"/);
assert.match(html,/id="designImportSave"/);
assert.match(app,/await saveTemplateDocument\(doc\)/);
assert.match(app,/Импортирован макет/);
assert.match(app,/window\.navigator\?\.clipboard\?\.writeText/);
assert.match(html,/Существующие макеты не перезаписываются/);
new Function(app);
console.log("Design import passed: native and raster JSON, date fields, fresh IDs, strict validation, no print.");
