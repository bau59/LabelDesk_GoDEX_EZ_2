// Node-only smoke for the universal item workflow; no printer hardware is contacted.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
let sequence=500;
const ids=["name","weightG","kcal","protein","fat","carbs","ingredients","allergens",
  "shelfLifeHours","storage","manufacturer","address","barcode"];
const row=(n,name,value)=>({id:uuid(n),kind:"text",value,fieldName:name,isVariable:true,
  deviceFont:"A00",xMM:0,widthMM:55,heightMM:2,rotation:0,prefix:""});
const templates=[
 {id:uuid(1),name:"Состав",widthMM:58,heightMM:38,gapMM:2,printMode:"text",starterPack:"food-v1",
  elements:[row(11,"Название блюда","[НАЗВАНИЕ]"),row(12,"Масса нетто","[МАССА]"),
    row(13,"Изготовлено","[ДАТА]"),row(14,"Годен до","[ДАТА]"),
    row(15,"Производитель","[ПРОИЗВОДИТЕЛЬ]")]},
 {id:uuid(2),name:"КБЖУ",widthMM:58,heightMM:38,gapMM:2,printMode:"text",
  elements:[row(21,"Название блюда","[НАЗВАНИЕ]"),row(22,"Калорийность","[ККАЛ]"),
    row(23,"Белки","[БЕЛКИ]"),row(24,"Состав","[СОСТАВ]")]}
];
const copy=x=>JSON.parse(JSON.stringify(x));
const elements=new Map(),bodyHandlers=[];
class E {
 constructor(id){this.id=id;this.value="";this.innerHTML="";this.textContent="";
   this.checked=false;this.disabled=false;this.listeners=new Map();}
 addEventListener(type,fn){this.listeners.set(type,fn);}
 fire(type,target=this){const fn=this.listeners.get(type);
   assert.ok(fn,"missing "+type+" listener for "+this.id);return fn({target});}
 removeAttribute(key){delete this[key];}
 focus(){}
}
const $=id=>{if(!elements.has(id))elements.set(id,new E(id));return elements.get(id);};
const document={getElementById:$,body:{addEventListener:(type,fn)=>bodyHandlers.push({type,fn})}};
const root={confirm:()=>true,EZ2Raster:{
  transportReady:()=>true,draw:()=>({toDataURL:()=>"data:image/png;base64,AA=="})
}};
const context={window:root,document,Date,Number,String,Array,Object,Map,Set,Math};
for(const name of ["dish-engine.js","dish-controller.js"]){
 vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+name,"utf8"),context,{filename:name});
}
const engine=root.EZ2Dishes;
assert.equal(engine.fieldKey("Масса нетто"),"weightG");
assert.equal(engine.fieldKey("Дата изготовления"),"producedAt");
assert.equal(engine.expiry("2026-11-16T10:00","48"),"2026-11-18T10:00");
const product={name:"Суп",weightG:"250",kcal:"80",protein:"6",ingredients:"Вода, картофель",
  shelfLifeHours:"48",manufacturer:"Кухня"};
const batch={producedAt:"2026-11-16T10:00",batchCode:"B-1"};
const filled=engine.fill(templates[0],product,batch);
assert.equal(filled.elements[1].value,"250 г");
assert.equal(filled.elements[3].value,"18.11.2026 10:00");
assert.equal(templates[0].elements[1].value,"[МАССА]","Source template mutated");
const omitted=engine.fill(templates[0],{...product,manufacturer:""},batch);
assert.equal(omitted.elements.some(x=>x.fieldName==="Производитель"),false);
assert.equal(omitted.elements.length,4);
const noDates=engine.fill(templates[0],product,{producedAt:""});
assert.equal(noDates.elements.length,3,"Unfilled dates must not be printed");
const customTemplate={...templates[1],elements:[row(31,"Название","[НАЗВАНИЕ]"),
  row(32,"Артикул","[АРТИКУЛ]"),row(33,"Несуществующее","[НЕТ]")]};
const custom=engine.fill(customTemplate,{name:"Товар",customFields:[
  {id:uuid(300),name:"артикул",value:"SKU-42"}]},{});
assert.equal(custom.elements.length,2);
assert.equal(custom.elements[1].value,"SKU-42");
assert.equal(templates[1].elements[0].value,"[НАЗВАНИЕ]");
assert.throws(()=>engine.fill({elements:[row(90,"Не существует","[НЕТ]")]},
  {name:"Пустой"},{}),/нет заполненных полей/);
const state={templates:copy(templates),jobs:[],running:false};
const persisted={items:[],queue:[]},logs=[];
const native=async(action,args)=>{
 assert.equal(action,"saveData");
 persisted[args.key]=JSON.parse(args.json);
 return true;
};
const api={state,native,uuid:()=>uuid(sequence++),clone:copy,note:x=>logs.push(x),
 compatibility:()=>({ok:true}),media:()=>({heightMM:38,gapMM:2}),
 encodeJob:doc=>{assert.ok(doc.elements.every(x=>!x.value.includes("[")));
   return {base64:"QUJDREVGRw==",size:8};},renderQueue:()=>{}};
const controller=root.EZ2DishController.create(api);
controller.bootstrap([]);
$("batchProducedAt").value="2026-11-16T10:00";
async function save(name){
 $("newDish").fire("click");
 const vals={name,weightG:"250",kcal:"80",protein:"6",fat:"2",carbs:"10",
   ingredients:"Вода, картофель",shelfLifeHours:"48",manufacturer:"Кухня"};
 for(const [key,value] of Object.entries(vals))
   $("dishFields").fire("input",{dataset:{dish:key},value});
 await $("saveDish").fire("click");
}
(async()=>{
 await save("Суп");
 await save("Каша");
 assert.equal(persisted.items.length,2);
 const first=persisted.items[0];
 const clickTable=(selector,dataset)=>{
   const target={closest:q=>q===selector?{dataset}:null};
   $("dishBatchRows").fire("click",target);
 };
 // Stepper changes quantity without depending on a native number-spinner.
 clickTable("[data-copy-step]",{copyStep:"1",dishId:first.id});
 assert.match($("dishBatchRows").innerHTML,/copies-stepper/);
 assert.match($("dishBatchRows").innerHTML,/value="2"/);
 // Template chooser is a visible card grid, not an OS-native dropdown.
 clickTable("[data-open-template]",{openTemplate:first.id});
 assert.match($("dishBatchRows").innerHTML,/template-pick-row/);
 clickTable("[data-pick-template]",{pickTemplate:templates[1].id,dishId:first.id});
 await $("queueDishes").fire("click");
 assert.equal(state.jobs.length,2);
 assert.equal(persisted.queue.length,2);
 assert.equal(state.jobs[0].copies,2);
 assert.equal(state.jobs[0].document.name,"Суп · КБЖУ");
 assert.equal(state.jobs[1].document.name,"Каша · Состав");
 assert.equal(state.jobs[1].document.elements[3].value,"18.11.2026 10:00");
 assert.equal(state.templates[0].elements[0].value,"[НАЗВАНИЕ]");
 // Missing optional dates are omitted, not treated as fatal.
 $("batchProducedAt").value="";
 await $("queueDishes").fire("click");
 assert.equal(state.jobs.length,4);
 assert.equal(state.jobs[3].document.elements.some(e=>e.fieldName==="Годен до"),false);
 // A broken template still rejects the WHOLE selected batch, with no queue mutation.
 // Removing a referenced saved template must abort the entire next batch.
 state.templates.splice(1,1);
 await $("queueDishes").fire("click");
 assert.equal(state.jobs.length,4);
 assert.match($("dishBatchStatus").textContent,/шаблон не найден/);
 // New custom field added through the catalog form is saved and reopened.
 const id=persisted.items[0].id;
 controller.render();
 const handlers=bodyHandlers.filter(h=>h.type==="click");
 const open={closest:selector=>selector==="[data-dish-open]"?{dataset:{dishOpen:id}}:null};
 handlers.forEach(h=>h.fn({target:open}));
 $("addCustomField").fire("click");
 $("customFields").fire("input",{dataset:{customName:"0"},value:"Артикул"});
 $("customFields").fire("input",{dataset:{customValue:"0"},value:"SKU-17"});
 await $("saveDish").fire("click");
 assert.equal(persisted.items.find(d=>d.id===id).customFields[0].name,"Артикул");
 assert.equal(persisted.items.find(d=>d.id===id).customFields[0].value,"SKU-17");
 console.log("Item catalog smoke passed: migration-safe saves, custom fields, omitted blanks, mixed templates and atomic queue.");
})().catch(e=>{console.error(e);process.exitCode=1;});
