"use strict";
// Fixed-height text fields must wrap within a reserved slot without moving
// the following fields. Generated packages use the real native CP866 encoder.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const context={window:{},btoa:s=>Buffer.from(s,"binary").toString("base64")};
for(const file of ["barcodes.js","text-engine.js","dish-engine.js"])
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+file,"utf8"),context,{filename:file});
const txt=context.window.EZ2Text,dishes=context.window.EZ2Dishes;
const clean=x=>JSON.parse(JSON.stringify(x));
const field=(id,value,more={})=>({
  id,kind:"text",xMM:0,yMM:0,widthMM:20,heightMM:3,
  deviceFont:"A00",prefix:"",value,rotation:0,isVariable:false,...more
});
const doc=(elements)=>({widthMM:58,heightMM:38,gapMM:2,printMode:"text",elements});
const intro=field("name","МОЛОКО",{deviceFont:"A11",fixedRows:1,widthMM:55});
const last=field("date","ИЗГ. 17.11",{fixedRows:1,widthMM:55});
const short=doc([intro,field("ingredients","Мука",{fixedRows:3}),last]);
const full=doc([intro,field("ingredients","Мука\nМасло\nСоль",{fixedRows:3}),last]);
const a=txt.plan(short),b=txt.plan(full);
assert.equal(a.usedDots,66); // 26-dot A11 + 3*10-dot A00 + 10-dot A00
assert.equal(b.usedDots,a.usedDots);
assert.equal(a.rows.length,b.rows.length);
assert.equal(a.rows.at(-1).text,last.value);
assert.equal(b.rows.at(-1).text,last.value);
assert(a.rows.slice(1,4).filter(r=>r.reserved).length===2);
assert(b.rows.slice(1,4).every(r=>!r.reserved));
assert(a.rows.slice(1,4).every(r=>r.element.id==="ingredients"));
assert.equal(a.rows[2].text," "); // empty row emits an ordinary printable CR
assert.equal(clean(short.elements[1]).value,"Мука");
const long=doc([intro,field("ingredients","один\nдва\nтри\nчетыре",{fixedRows:3}),last]);
assert.throws(()=>txt.build(long),/требует 4 строк, доступно 3/);
const preview=txt.plan(long,{allowOverflowPreview:true});
assert.equal(preview.issues.length,1);
assert.equal(preview.rows.length,a.rows.length);
assert.equal(preview.usedDots,a.usedDots);
assert.equal(preview.rows.at(-1).text,last.value);
assert.equal(preview.rows.some(r=>r.text==="четыре"),false);
assert.throws(()=>txt.plan(doc([field("invalid","x",{fixedRows:0})])),/от 1 до 20/);
assert.throws(()=>txt.plan(doc([field("invalid","x",{fixedRows:21})])),/от 1 до 20/);
const width=field("w","Состав: мука молоко масло",{fixedRows:5,widthMM:12});
const narrow=txt.plan(doc([width]));
assert.equal(narrow.rows.length,5);
assert.equal(narrow.rows.filter(r=>r.reserved).length,2);
assert(narrow.rows.slice(0,3).every(r=>r.text.length<=12));
const oldA=txt.plan(doc([field("old","один"),last]));
const oldB=txt.plan(doc([field("old","один\nдва"),last]));
assert.equal(oldB.usedDots,oldA.usedDots+10,
 "Legacy labels stay auto-height until user explicitly fixes their field");
const inverse1=doc([field("inv","СТОП",{fixedRows:2,reversePrint:true}),last]);
const inverse2=doc([field("inv","СТОП\nВАЖНО",{fixedRows:2,reversePrint:true}),last]);
const i1=txt.plan(inverse1),i2=txt.plan(inverse2);
assert.equal(i1.usedDots,i2.usedDots);
assert.equal(i1.usedDots,50); // 2*(A00+gap) + date
assert.equal(i1.rows.filter(r=>r.inverseSpacer).length,2);
assert.equal(i2.rows.filter(r=>r.inverseSpacer).length,2);
assert.equal(i1.rows.at(-1).text,last.value);
assert.equal(i2.rows.at(-1).text,last.value);
const none=txt.plan(doc([field("blank","",{fixedRows:2}),last]));
assert.equal(none.rows.length,3);
assert(none.rows.slice(0,2).every(r=>r.text===" "));
const filled1=dishes.fill(doc([
  field("ingredient","[ИНГРЕДИЕНТЫ]",{
    isVariable:true,fieldName:"Состав",fixedRows:3,prefix:"Состав: "}),
  field("end","ГОТОВО",{fixedRows:1})]),{name:"Тест",ingredients:"",customFields:[]});
const filled2=dishes.fill(doc([
  field("ingredient","[ИНГРЕДИЕНТЫ]",{
    isVariable:true,fieldName:"Состав",fixedRows:3,prefix:"Состав: "}),
  field("end","ГОТОВО",{fixedRows:1})]),{name:"Тест",ingredients:"Мука",customFields:[]});
assert.equal(filled1.elements.length,2);
assert.equal(filled1.elements[0].value,"");
assert.equal(filled1.elements[0].prefix,"");
assert.equal(txt.plan(filled1).usedDots,txt.plan(filled2).usedDots);
assert.equal(txt.plan(filled1).rows.at(-1).text,"ГОТОВО");
assert.equal(txt.plan(filled2).rows.at(-1).text,"ГОТОВО");
assert.equal(Buffer.from(txt.build(short,1).base64,"base64").subarray(-6).toString("hex"),
  "1b451b503031");
const variable={...short,heightMM:60,gapMM:3};
const variableBytes=Buffer.from(txt.build(variable,1).base64,"base64");
assert.equal(variableBytes.subarray(3,8).toString("binary"),"\x1bq063");
assert.equal(Buffer.from(txt.build(short,1).base64,"base64").subarray(3,8).toString("binary"),"\x1bq040");
assert.throws(()=>txt.build({...short,heightMM:10}),/высоту 10 мм/);
assert.throws(()=>txt.build({...short,gapMM:0}),/зазор/);
const editor=fs.readFileSync("LabelDesk/Resources/editor.html","utf8");
assert.match(editor,/fixedRows:doc\.printMode==="text"&&kind==="text"/);
assert.match(editor,/Высота поля, строк/);
assert.match(editor,/className="native-fixed-field"/);
assert.match(editor,/allowOverflowPreview:true/);
console.log("Fixed text field height smoke passed: reserved rows, wrap, no shifts, overflows, reverse and catalog.");
