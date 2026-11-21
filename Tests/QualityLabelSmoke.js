"use strict";
// 58x30 mm quality label: two visible lines, Mac-local time resolved on print.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const root={};
const context={window:root,btoa:s=>Buffer.from(s,"binary").toString("base64")};
for(const filename of ["barcodes.js","text-engine.js","dish-engine.js","food-presets.js"])
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+filename,"utf8"),context,{filename});
const existing=root.EZ2FoodPresets.build();
assert.equal(existing.templates.length,4,"Existing food pack stays unchanged");
const pack=root.EZ2QualityPreset;
assert.equal(pack.version,"quality-58x30-v1");
const result=pack.build();
assert.equal(result.folders.length,1);
assert.equal(result.folders[0].name,"Контроль качества");
assert.equal(result.templates.length,1);
const doc=result.templates[0],before=JSON.stringify(doc);
assert.equal(doc.name,"Контроль качества · 58×30");
assert.equal(doc.widthMM,58);
assert.equal(doc.heightMM,30);
assert.equal(doc.gapMM,2);
assert.equal(doc.printMode,"text");
assert.equal(doc.elements.length,3);
assert.equal(doc.elements[2].dynamicValue,"printDateTime");
assert.equal(doc.elements[2].isVariable,false);
const now=new Date(2026,10,21,13,47);
const planned=root.EZ2Text.plan(doc,{now});
assert.equal(planned.rows.length,11);
assert.equal(planned.usedDots,150);
assert(planned.rows.slice(0,9).every(r=>r.text===" "));
assert.equal(planned.rows[9].text,"Контроль качества пройден");
assert.equal(planned.rows[10].text,"Изготовлено и упаковано: 21.11.2026 13:47");
assert.equal(planned.rows.filter(r=>r.text.trim()).length,2,"Exactly two printed text lines");
assert.equal(planned.rows[9].margin>1,true);
const packet=Buffer.from(root.EZ2Text.build(doc,1).base64,"base64");
assert.equal(packet.subarray(0,12).toString("hex"),"1b46301b713033321b4d3031",
  "58x30 + 2 mm gap must emit q032");
assert.match(packet.toString("binary"),/\d\d\.\d\d\.\d{4} \d\d:\d\d/);
assert.equal(packet.subarray(-6).toString("hex"),"1b451b503031");
const batchPacket=Buffer.from(root.EZ2Text.build(doc,120).base64,"base64");
assert.equal(batchPacket.subarray(-9).toString("hex"),"1b451b703132300d0a",
  "120 identical date-stamped labels must use native P120 in a single job");
assert.equal((batchPacket.toString("binary").match(/\d\d\.\d\d\.\d{4} \d\d:\d\d/g)||[]).length,1,
  "Batch payload contains a single shared print timestamp");
const catalogFilled=root.EZ2Dishes.fill(doc,{name:"Любое блюдо"},{});
assert.equal(catalogFilled.elements.length,3,"Catalog fill keeps automatic stamp");
assert.equal(catalogFilled.elements[2].dynamicValue,"printDateTime");
assert.equal(JSON.stringify(doc),before,"Preview and print never modify the template");
const app=fs.readFileSync("LabelDesk/Resources/app.js","utf8");
const editor=fs.readFileSync("LabelDesk/Resources/editor.html","utf8");
assert.match(app,/state\.settingsSnapshot\.qualityPresetPack===pack\.version/);
assert.match(app,/await installQualityPreset\(\)/);
assert.match(editor,/Дата и время автоматически при печати/);
console.log("58x30 quality label passed: two lines, dynamic local date/time, q032, one-time installation.");
