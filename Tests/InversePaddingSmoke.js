"use strict";
// CP866 ESC V panel padding must survive the native line wrapper and the encoder.
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const context={window:{},btoa:value=>Buffer.from(value,"binary").toString("base64")};
vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/text-engine.js","utf8"),context);
const text=context.window.EZ2Text;
const field=(value,extra={})=>({
  id:"reverse",kind:"text",deviceFont:"A00",xMM:0,yMM:0,
  widthMM:55,heightMM:1.25,fixedRows:1,
  value,prefix:"",reversePrint:true,isVariable:false,...extra
});
const doc=(field0,heightMM=38)=>({
  name:"Reverse test",printMode:"text",widthMM:58,heightMM,gapMM:2,elements:[field0]
});
const full=doc(field("СТОП",{inversePadLeft:3,inversePadRight:4}));
const before=JSON.stringify(full);
const plan=text.plan(full);
assert.equal(plan.rows[0].text,"   СТОП    ");
assert.equal(plan.rows[0].reverse,true);
assert.equal(plan.rows[0].margin,1);
assert.equal(plan.rows[0].font.widthDots,8);
assert.equal(plan.rows[0].text.length,11);
assert.equal(plan.usedDots,20,"One A00 line + one inverse separation");
const encoded=Buffer.from(text.build(full).base64,"base64");
assert(encoded.includes(Buffer.from([27,86,32,32,32,145,146,142,143,32,32,32,32,13])),
  "ESC V must carry padded CP866 content through trailing spaces to CR");
assert.equal(JSON.stringify(full),before,"Compiler must not change saved template");
const unchanged=doc(field("СТОП"));
assert.equal(text.plan(unchanged).rows[0].text,"СТОП","Old inverted labels must remain unchanged");
const normal=doc(field("СТОП",{reversePrint:false,inversePadLeft:3,inversePadRight:4}));
assert.equal(text.plan(normal).rows[0].text,"СТОП","Padding only applies to inverse printing");
const manual=doc(field("СТОП  ",{inversePadLeft:2,inversePadRight:2}));
assert.equal(text.plan(manual).rows[0].text,"  СТОП    ",
  "Trailing hand-typed spaces must also be preserved in inverse mode");
assert.equal(text.wrapText("ТЕСТ  ",20)[0],"ТЕСТ",
  "Normal non-inverted wrapping still trims trailing blanks");
assert.equal(text.wrapText("ТЕСТ  ",20,true)[0],"ТЕСТ  ",
  "Inverse wrapping can preserve explicit trailing blanks");
for(const invalid of [-1,13,0.5,NaN]){
  assert.throws(()=>text.plan(doc(field("X",{inversePadLeft:invalid}))),
    /Отступы инверсии/);
  assert.throws(()=>text.plan(doc(field("X",{inversePadRight:invalid}))),
    /Отступы инверсии/);
}
assert.throws(()=>text.plan(doc(field("X",{widthMM:3,inversePadLeft:2,
  inversePadRight:1}))),/Отступы инверсии не помещаются/);
const narrow=doc(field("СТОП",{widthMM:5,inversePadLeft:1,inversePadRight:1}));
assert.throws(()=>text.build(narrow),/требует 2 строк, доступно 1/,
  "Padding must respect fixed field height and refuse overflow");
const laid=text.plan(narrow,{allowOverflowPreview:true});
assert.equal(laid.issues.length,1);
const next=doc(field("СТОП",{inversePadLeft:2,inversePadRight:2}),30);
next.elements.push(field("СЛЕДУЮЩАЯ",{id:"following",reversePrint:false,
  inversePadLeft:0,inversePadRight:0}));
const nextPlan=text.plan(next);
assert.equal(nextPlan.rows.at(-1).text,"СЛЕДУЮЩАЯ",
  "Pad only changes inverse row width; following rows retain their original position");
const editor=fs.readFileSync("LabelDesk/Resources/editor.html","utf8");
assert.match(editor,/Чёрная плашка \(инверсия\)/);
assert.match(editor,/Отступ слева, симв\./);
assert.match(editor,/Отступ справа, симв\./);
assert.match(editor,/n=>\{e\.inversePadLeft=n;\}/);
assert.match(editor,/n=>\{e\.inversePadRight=n;\}/);
const preview=fs.readFileSync("LabelDesk/Resources/app.js","utf8");
assert.match(preview,/const textWidth=charCount\*charWidth/);
console.log("Inverse padding passed: native ESC V bytes, both edges, preview geometry, overflow, fixed rows.");
