"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const win = {};
vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/dish-controller.js", "utf8"),
  {window:win, document:{}}, {filename:"dish-controller.js"});
const ai = win.EZ2AIFill;
assert.ok(ai, "AI module exists");

const controls = [
  {id:"dishName", dataset:{dish:"name"}, tagName:"INPUT", type:"text", min:"", max:""},
  {id:"dishWeight", dataset:{dish:"weightG"}, tagName:"INPUT", type:"number", min:"0", max:""},
  {id:"itemKind", dataset:{dish:"kind"}, tagName:"SELECT", type:"select-one", min:"", max:"",
    options:[{value:"product", textContent:"Товар"},{value:"food", textContent:"Блюдо"}]}
];
const labels = {
  dishName:{textContent:"Название *"},
  dishWeight:{textContent:"Вес / масса, г"},
  itemKind:{textContent:"Тип записи"}
};
const form = {
  querySelectorAll:() => controls,
  querySelector:q => labels[q.slice(11,-2)] || null
};
const draft = {id:"existing", name:"Старое", weightG:"100", kind:"product", folderID:"food",
  customFields:[{id:"original", name:"Марка", value:"Прежняя"}]};
const items = [
  {folderID:"food", customFields:[{name:"Цвет", value:"Красный"}]},
  {folderID:"other", customFields:[{name:"Чужое", value:"Нет"}]}
];
const fields = ai.discoverFields(form,draft,items);
assert.ok(fields.some(f=>f.id==="custom:марка"));
assert.ok(fields.some(f=>f.id==="custom:цвет"));
assert.ok(!fields.some(f=>f.id==="custom:чужое"));
assert.equal(fields.find(f=>f.key==="weightG").type,"number");
const selected = new Set(["name","weightG","kind","custom:марка"]);
const prompt = ai.buildPrompt(fields,selected,draft,"Еда",false);
assert.ok(prompt.includes('"weightG": null'));
assert.ok(!prompt.includes('"folderID": null'));
assert.ok(!prompt.includes('"id": null'));
assert.ok(!prompt.includes('"Цвет"'));
const clone = x=>JSON.parse(JSON.stringify(x));
const validate = x=>{
  if(x.name.length>140)throw Error("Название слишком длинное");
  if(Number(x.weightG)>100000)throw Error("Некорректное число: weightG");
};
const run = raw=>ai.validateJSON(raw,fields,selected,draft,clone,()=>"uuid",validate);
const good = run('{"name":"Новое","weightG":250,"customFields":[{"name":"Марка","value":"Новая"}]}');
assert.equal(good.errors.length,0);
assert.equal(good.candidate.name,"Новое");
assert.equal(good.candidate.weightG,"250");
assert.equal(good.candidate.customFields[0].id,"original");
assert.equal(good.candidate.customFields[0].value,"Новая");
assert.equal(draft.name,"Старое");
const nulls = run('{"name":null,"weightG":null}');
assert.equal(nulls.errors.length,0);
assert.equal(nulls.changed,0);
const unknown = run('{"name":"Новое","id":"foreign","bogus":1}');
assert.equal(unknown.errors.length,0);
assert.equal(unknown.warnings.length,2);
assert.equal(unknown.candidate.id,"existing");
const ignored = run('{"customFields":[{"name":"Цвет","value":"Зелёный"}],"name":"Новое"}');
assert.equal(ignored.errors.length,0);
assert.ok(ignored.warnings.some(s=>s.includes("не выбрано")));
assert.equal(ignored.candidate.customFields.length,1);
for(const raw of [
  '{"name":12}', '{"weightG":"250"}', '{"weightG":100001}',
  '{"kind":"unexpected"}', '{"customFields":{}}',
  '{"customFields":[{"name":"Марка","value":100}]}',
  '{"customFields":[{"name":"Марка","value":"X"},{"name":"Марка","value":"Y"}]}',
  '{"name":'
]){
  const v=run(raw);
  assert.ok(v.errors.length,raw);
  assert.equal(v.candidate,null,"Invalid JSON may not partially update the form");
}
console.log("AI catalog smoke: ok");
