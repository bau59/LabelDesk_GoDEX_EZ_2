// Node-only smoke for the saved dish workflow; no printer hardware is contacted.
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
assert.throws(()=>engine.fill(templates[0],{...product,manufacturer:""},batch),/Производитель/);
assert.throws(()=>engine.fill(templates[0],product,{producedAt:""}),/Изготовлено/);
const state={templates:copy(templates),jobs:[],running:false};
const persisted={dishes:[],queue:[]},logs=[];
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
 assert.equal(persisted.dishes.length,2);
 const first=persisted.dishes[0];
 $("dishBatchRows").fire("change",{dataset:{dishTemplate:first.id},value:templates[1].id});
 await $("queueDishes").fire("click");
 assert.equal(state.jobs.length,2);
 assert.equal(persisted.queue.length,2);
 assert.equal(state.jobs[0].document.name,"Суп · КБЖУ");
 assert.equal(state.jobs[1].document.name,"Каша · Состав");
 assert.equal(state.jobs[1].document.elements[3].value,"18.11.2026 10:00");
 assert.equal(state.templates[0].elements[0].value,"[НАЗВАНИЕ]");
 // Failed validation is atomic: neither item is added.
 $("batchProducedAt").value="";
 await $("queueDishes").fire("click");
 assert.equal(state.jobs.length,2);
 assert.match($("dishBatchStatus").textContent,/Изготовлено/);
 console.log("Dish catalog smoke passed: save, auto-select, mixed templates, expiry, atomic queue, immutability.");
})().catch(e=>{console.error(e);process.exitCode=1;});
