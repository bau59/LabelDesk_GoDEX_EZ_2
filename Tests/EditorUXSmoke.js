"use strict";
// The editor exposes common tasks, hides technical options, and preserves CP866 layout.
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const html=fs.readFileSync("LabelDesk/Resources/editor.html","utf8");
assert.match(html,/<button[^>]+data-add="text">＋ Текст<\/button>/);
assert.match(html,/<button[^>]+data-add="barcode">▥ Штрихкод<\/button>/);
assert.match(html,/<details class="add-more">/);
assert.match(html,/<button[^>]+data-add="inverseText">Текст на плашке<\/button>/);
assert.match(html,/Режим и дополнительные настройки/);
assert.match(html,/function renderNativeTextProps\(root,e\)/);
assert.match(html,/root\.appendChild\(prop\("Размер шрифта",chooser\)\)/);
assert.match(html,/root\.appendChild\(prop\("Выравнивание",align\)\)/);
assert.match(html,/advanced\.appendChild\(pair\([\s\S]*?Масштаб X/);
assert.match(html,/root\.appendChild\(details\);[\s\S]*?return;/);
assert.match(html,/if\(blank&&selected!==field\.id\)continue;/);
assert.match(html,/const budget=Number\(doc\.heightMM\)\*8-48;/);
assert.match(html,/Макет готов/);
const source=html.match(/function labelFor\(e\)\{[\s\S]*?(?=function renderLayers\()/);
assert(source,"Label list caption formatter");
const root={};
vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/food-presets.js","utf8"),
 {window:root});
const label=root.EZ2QualityPreset.build().templates[0];
const labelFor=new Function("typeNames","doc",
 source[0]+"return labelFor;")(
 {text:"Текст",barcode:"Штрихкод"},label);
assert.equal(labelFor(label.elements[0]),"Отступ сверху · 9 строк");
assert.equal(labelFor(label.elements[1]),"Контроль качества пройден");
assert.equal(labelFor(label.elements[2]),"Дата и время печати");
assert.equal(label.elements[0].fixedRows,9,"User template content is unchanged");
const js=html.match(/<script>([\s\S]*?)<\/script>/);
assert(js,"Embedded editor JavaScript");
new Function(js[1]); // parse the entire editor
console.log("Editor UI passed: concise toolbar, advanced settings, clear layer captions, native layout preserved.");
