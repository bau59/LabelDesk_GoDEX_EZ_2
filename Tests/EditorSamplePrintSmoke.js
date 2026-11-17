"use strict";
// One-label editor proof uses current unsaved rows and literal template placeholders.
// Tests never contact the printer or write saved user documents.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const context={window:{},btoa:s=>Buffer.from(s,"binary").toString("base64")};
for(const file of ["barcodes.js","text-engine.js","food-presets.js"])
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+file,"utf8"),context,{filename:file});
const original=context.window.EZ2FoodPresets.build().templates[0];
const originalJSON=JSON.stringify(original);
assert.equal(original.starterPack,"food-v1");
assert.throws(()=>context.window.EZ2Text.build(original,1),/Заполните поле/);
const testDocument=JSON.parse(JSON.stringify(original));
delete testDocument.starterPack;
testDocument.name="Проба макета · "+testDocument.name;
const built=context.window.EZ2Text.build(testDocument,1);
assert.equal(built.copies,1);
assert(built.rows>0&&built.size<=8192);
const bytes=Buffer.from(built.base64,"base64");
assert(bytes.includes(Buffer.from([91]))&&bytes.includes(Buffer.from([93])),
  "The actual buffered packet must contain literal bracket placeholders");
assert.equal(JSON.stringify(original),originalJSON,"Editor print cannot mutate saved template");
const app=fs.readFileSync("LabelDesk/Resources/app.js","utf8");
const html=fs.readFileSync("LabelDesk/Resources/app.html","utf8");
assert(html.includes('id="printEditorSample"'),"Button must be visible in template editor");
assert(app.includes('clone(state.current)'),"Must use actual unsaved editor state");
assert(app.includes("delete sample.starterPack"),"Only test copy bypasses the food placeholder guard");
assert(app.includes("queueDocument(sample,1)"),"Test must create only one normal queue job");
assert(app.includes("printQueue(true,[jobID])"),"Test must only print its own queued job");
assert(app.includes('addEventListener("click",printEditorSample)'),"Button must be wired");
console.log("Editor sample print passed: unsaved placeholders, immutable template, isolated one-copy queue.");
