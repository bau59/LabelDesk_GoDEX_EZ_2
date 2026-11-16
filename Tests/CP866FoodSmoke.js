"use strict";
// Run in GitHub Actions; no Node.js required by the shipped macOS app.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const context={
  window:{},btoa:s=>Buffer.from(s,"binary").toString("base64")
};
for(const path of ["barcodes.js","text-engine.js","food-presets.js"])
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+path,"utf8"),context,{filename:path});
const printer=context.window.EZ2Text;
const presets=context.window.EZ2FoodPresets.build();
const decode=x=>Buffer.from(x.base64,"base64");
const toPlain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(toPlain(printer.cp866("АБВЁ абвряё № ┌─┐")),
  [0x80,0x81,0x82,0xf0,0x20,0xa0,0xa1,0xa2,0xe0,0xef,0xf1,0x20,0xfc,0x20,218,196,191]);
assert.throws(()=>printer.cp866("→"),/Не поддерживается/);
assert.throws(()=>printer.cp866("—"),/Не поддерживается/);
assert.equal(printer.font("A11").heightDots,26);
assert.equal(printer.font("A12").heightDots,52);
assert.equal(printer.font("A02").heightDots,20);
assert.equal(printer.font("A21").widthDots,32);
assert.deepEqual(toPlain(printer.font("A00")),{code:"A00",widthDots:8,heightDots:10});
assert.deepEqual(toPlain(printer.font("A01")),{code:"A01",widthDots:8,heightDots:10,bold:true});
assert.equal(printer.font("A03").heightDots,30);
assert.equal(printer.font("A04").widthDots,16);
assert.equal(printer.font("A04").heightDots,20);
assert.equal(printer.font("A22").widthDots,32);
assert.equal(printer.font("A22").heightDots,52);
assert.throws(()=>printer.font("A99"),/Неизвестный/);
const make=(elements,mode="text")=>({
  widthMM:58,heightMM:38,gapMM:2,printMode:mode,elements
});
const row=(value,more={})=>({
  id:"test",kind:"text",value,prefix:"",xMM:0,yMM:0,
  widthMM:55,heightMM:2,deviceFont:"A00",rotation:0,...more
});
// A frame is a single editable element expanded to sequential native CP866 rows.
const oneFrame={id:"frame",kind:"textFrame",value:"Суп",frameChars:12,frameRows:2,
  frameStyle:"single",xMM:0,widthMM:55,rotation:0};
const frameDocument=make([oneFrame,row("После рамки",{id:"after"})]);
const framePlan=printer.plan(frameDocument);
assert.equal(framePlan.rows.length,5);
assert.equal(framePlan.rows[0].text,"┌──────────┐");
assert.equal(framePlan.rows[1].text.length,12);
assert.match(framePlan.rows[1].text,/^│ Суп/);
assert.equal(framePlan.rows[2].text,"│          │");
assert.equal(framePlan.rows[3].text,"└──────────┘");
assert.equal(framePlan.rows[4].text,"После рамки");
const framePacket=decode(printer.build(frameDocument));
assert.ok(framePacket.includes(Buffer.from([218,196,196,196])));
assert.ok(framePacket.includes(Buffer.from([192,196,196,196])));
assert.ok(!framePacket.includes(Buffer.from([27,71])),"Frame must not inject raster commands");
assert.equal(oneFrame.value,"Суп","Frame compilation never edits original template");
const doubleFrame=printer.plan(make([{...oneFrame,frameStyle:"double",frameRows:1}]));
assert.equal(doubleFrame.rows[0].text,"╔══════════╗");
assert.equal(doubleFrame.rows[2].text,"╚══════════╝");
assert.throws(()=>printer.plan(make([{...oneFrame,frameChars:56}])),/Ширина рамки/);
assert.throws(()=>printer.plan(make([{...oneFrame,value:"Длинный заголовок в рамке"}])),
  /Текст рамки длиннее/);
// Previously limited to five lines; modern editor allows a taller framed
// block while the total 38-mm physical height safety limit still applies.
const seven=printer.plan(make([{...oneFrame,frameRows:7}]));
assert.equal(seven.rows.length,9);
const multiFrame=printer.plan(make([{...oneFrame,value:"Молоко\\nПастеризованное",frameRows:0,
  frameChars:22,textAlignment:"center",deviceFont:"A00"}]));
assert.equal(multiFrame.rows.length,4);
assert.match(multiFrame.rows[1].text,/Молоко/);
assert.match(multiFrame.rows[2].text,/Пастеризованное/);
assert.throws(()=>printer.plan(make([{...oneFrame,frameRows:24}])),/высоту/);
assert.throws(()=>printer.frameLines({...oneFrame,frameRows:2,value:"1234567890".repeat(6)},12),
  /не помещается/);
const multi=make([
  row("ПРИВЕТ МИР", {id:"a",deviceFont:"A11"}),
  row("Состав: картофель, мясо, соль", {id:"b"}),
  row("Ёжик № 13", {id:"c",deviceFont:"A02"})
]);
const result=printer.build(multi,1);
const packet=decode(result);
assert.equal(packet.subarray(0,12).toString("hex"),"1b46301b713034301b4d3031");
assert.ok(packet.includes(Buffer.from([0x80,0x81]))===false);
assert.ok(packet.includes(Buffer.from([0x8f,0x90,0x88,0x82,0x85,0x92])),
  "Russian ПРИВЕТ must be CP866 bytes");
assert.ok(packet.includes(Buffer.from([0xf0])),"Capital Ё must encode to 0xF0");
assert.ok(packet.includes(Buffer.from([0xfc])),"No. sign № must encode in CP866");
assert.equal(packet.subarray(-6).toString("hex"),"1b451b503031");
assert.ok(!packet.includes(Buffer.from([0x1b,0x47])),"Text cannot contain Gnn raster");
// User-configurable safety margins must affect both wrapping and real Mnn bytes,
 // without changing the verified F0/q040/M01 packet header or paper feed.
 const insetDoc={...multi,marginLeftMM:3,marginRightMM:4};
 const inset=printer.plan(insetDoc);
 assert.equal(inset.margins.left,3);
 assert.equal(inset.margins.right,4);
 assert.ok(inset.rows.filter(r=>r.kind==="text").every(r=>
   (r.margin-1)*8+r.text.length*r.font.widthDots<=55*8-4*8));
 const insetPacket=decode(printer.build(insetDoc,1));
 assert.equal(insetPacket.subarray(0,12).toString("hex"),"1b46301b713034301b4d3031");
 assert.ok(insetPacket.includes(Buffer.from([27,77,48,52])),
   "3 mm left margin must emit M04 in buffered text body");
 assert.throws(()=>printer.plan({...multi,marginLeftMM:16}),/Поля печати/);
 assert.throws(()=>printer.plan({...multi,marginRightMM:-1}),/Поля печати/);
 const three=decode(printer.build(multi,3));
assert.equal(three.subarray(-6).toString("hex"),"1b451b503033");
const twoHundred=decode(printer.build(multi,200));
assert.equal(twoHundred.subarray(-9).toString("hex"),"1b451b703230300d0a");
const wrapped=make([row("Состав: "+"картофель ".repeat(9))]);
assert.ok(printer.plan(wrapped).rows.length>=2,"Long ingredients wrap to several lines");
assert.throws(()=>printer.build(make([row("─".repeat(220),{deviceFont:"A12"})])),/высот/);
const unknown=make([row("Маркировка →")]);
assert.throws(()=>printer.build(unknown),/Не поддерживается/);
const positioned=make([row("X",{xMM:56,widthMM:5})]);
assert.throws(()=>printer.build(positioned),/ширин/);
const withRect=make([{kind:"rectangle",xMM:0,yMM:0,widthMM:55,heightMM:5}]);
assert.throws(()=>printer.build(withRect),/растров/);
const barcode=make([row("ПАРТИЯ 001"),{
  kind:"barcode",barcodeType:"CODE128",value:"1234567890",xMM:0,yMM:4,
  widthMM:55,heightMM:12,showsHumanReadable:true,rotation:0
}]);
const bars=decode(printer.build(barcode,1));
assert.ok(bars.includes(Buffer.from([27,63,49,27,88,50])),
  "Code128 selector ?1 and X2 must precede buffered label");
assert.ok(bars.includes(Buffer.from([27,123,49,50,51,52,53,54,55,56,57,48,125,13])));
const ean=make([{
  kind:"barcode",barcodeType:"EAN13",value:"590123412345",
  xMM:0,yMM:0,widthMM:55,heightMM:12,rotation:0
}]);
assert.ok(decode(printer.build(ean)).includes(Buffer.from("5901234123457")),
  "EAN13 check digit must be generated");
assert.throws(()=>printer.build(make([
  {kind:"barcode",barcodeType:"CODE39",value:"ABCD",xMM:0,widthMM:55},
  row("WRONG")
])),/последним/);

assert.equal(presets.templates.length,4);
assert.equal(presets.folders.length,4);
assert.equal(new Set(presets.templates.map(x=>x.id)).size,4);
const keys=new Set();
for(const d of presets.templates) {
  assert.equal(d.printMode,"text");assert.equal(d.widthMM,58);
  assert.equal(d.heightMM,38);assert.equal(d.gapMM,2);
  assert.ok(d.elements.length>=6);
  for(const e of d.elements){
    assert.ok(!keys.has(e.id),"Every food label field UUID must be unique");
    keys.add(e.id);
  }
  assert.doesNotThrow(()=>printer.plan(d,{allowPlaceholders:true}),
    "Preview placeholders should fit: "+d.name);
  assert.throws(()=>printer.build(d),/Заполните поле/,
    "Do not print example food data: "+d.name);
  const filled=toPlain(d);
  for(const e of filled.elements)
    if(e.kind==="text" && /\[[^\]]+\]/.test(e.value))
      e.value=e.fieldName==="Название блюда"?"Суп с курицей":"12.11.26";
  assert.doesNotThrow(()=>printer.build(filled,1),
    "Completed food sample should compile into CP866: "+d.name);
  const repeated=toPlain(context.window.EZ2FoodPresets.build().templates.find(x=>x.id===d.id));
  assert.deepEqual(repeated,toPlain(d),"Stable sample IDs prevent duplication");
}
assert.ok(presets.templates.some(d=>d.elements.some(e=>e.fieldName==="Аллергены")));
assert.ok(presets.templates.some(d=>d.elements.some(e=>e.fieldName==="Калорийность")));
assert.ok(presets.templates.some(d=>d.elements.some(e=>e.kind==="barcode")));
const bridge=fs.readFileSync("LabelDesk/App/WebLabelDeskBridge.swift","utf8");
assert.match(bridge,/textMode \? "printer-text\.sh"/);
assert.match(bridge,/packet\.suffix\(end\.count\) == end/);
const driver=fs.readFileSync("Scripts/printer-text.sh","utf8");
assert.ok(!driver.includes("\\033G"),"Buffered driver must not insert any graphics/blank raster");
console.log("CP866 text + food templates passed: 4 folders, 4 templates, 1/3/200 copies, barcode and safety.");
