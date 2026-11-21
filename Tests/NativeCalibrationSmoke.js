"use strict";
// Independent native CP866 regression: calibrated G01/G02 geometry and new
// editable table/divider/inverse objects. No serial port access.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const context={window:{},btoa:s=>Buffer.from(s,"binary").toString("base64")};
for(const file of ["barcodes.js","text-engine.js"])
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+file,"utf8"),context,{filename:file});
const ez=context.window.EZ2Text;
const make=elements=>({printMode:"text",widthMM:58,heightMM:38,gapMM:2,elements});
const table={id:"tbl",kind:"textTable",xMM:0,widthMM:55,tableHeader:true,
  tableWidths:"7,22,8",value:"ID | NAME | QTY\n01 | МОЛОКО | 12\n02 | КАША | 4"};
const inverse={id:"inv",kind:"text",value:"ВАЖНО",widthMM:55,xMM:0,deviceFont:"A00",reversePrint:true};
const after={id:"after",kind:"text",value:"ПОСЛЕ ПЛАШКИ",widthMM:55,xMM:0,deviceFont:"A00"};
const separator={id:"line",kind:"line",widthMM:55,xMM:0,lineSymbol:"═",lineChars:40};
const original=JSON.stringify([table,inverse,after,separator]);
const label=make([table,inverse,after,separator]);
const plan=ez.plan(label);
assert.equal(plan.rows.length,10);
assert.equal(plan.usedDots,100,"A00 rows are 10 dots each; 8 dots=1mm");
assert.equal(plan.rows[0].text,"┌───────┬──────────────────────┬────────┐");
assert.equal(plan.rows[2].text,"├───────┼──────────────────────┼────────┤");
assert.equal(plan.rows[5].text,"└───────┴──────────────────────┴────────┘");
assert.equal(plan.rows[6].reverse,true);
assert.equal(plan.rows[7].inverseSpacer,true);
assert.equal(plan.rows[7].text,"");
assert.equal(plan.rows[8].text,"ПОСЛЕ ПЛАШКИ");
assert.equal(plan.rows[9].text,"═".repeat(40));
assert.equal(JSON.stringify(label.elements),original,"Never modify saved source");
const bytes=Buffer.from(ez.build(label,1).base64,"base64");
assert.equal(bytes.subarray(-6).toString("hex"),"1b451b503031","Exactly one native label");
assert(!bytes.includes(Buffer.from([27,71])),"Native frame/table may not send ESC G raster");
assert(bytes.includes(Buffer.from([27,86])),"ESC V inverse command still present");
assert(bytes.includes(Buffer.from([218,196,196])),"CP866 native top-left table line");
assert(bytes.includes(Buffer.from([195,196,196])),"CP866 tee junction row");
assert.throws(()=>ez.plan(make([{...table,tableWidths:"45,20,8"}])),/шире доступной ширины рулона/);
assert.throws(()=>ez.plan(make([{...table,value:"ONE|TWO"}])),/колонки/);
assert.throws(()=>ez.plan(make([{...table,tableWidths:"bad"}])),/ширины колонок/);
assert.equal(ez.plan(make([inverse])).rows.length,1,"No trailing blank if inverse is last");
assert.equal(ez.plan(make([separator])).rows[0].text,"═".repeat(40));
assert.equal(ez.plan(make([{...separator,lineSymbol:"█",lineChars:8}])).rows[0].text,"█".repeat(8));
assert.throws(()=>ez.plan(make([{...table,value:"ID | NAME | QTY\n"+"01 | LONG | 1\n".repeat(18)}])),/18 строк/);
const html=fs.readFileSync("LabelDesk/Resources/editor.html","utf8");
assert.match(html,/nativePreviewOrigin=\{leftMM:2,topMM:1\}/,
  "Preview uses measured approximate offsets, without changing the serial stream");
assert.match(html,/data-add="textTable"/);
assert.match(html,/data-add="inverseText"/);
assert.match(html,/\.text-preview-row\.is-reverse\{background:#111\}/);
assert.match(html,/lengthAdjust","spacingAndGlyphs"/,
  "Tall resident fonts must be scaled to their native cell, not small browser glyphs");
console.log("Native calibration smoke passed: G01/G02 geometry, CP866 table, inverse spacing and lines.");
