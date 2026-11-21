"use strict";
// CP866 maximum width follows the document/roll. No raster transport changes.
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const root={};
vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/text-engine.js","utf8"),
  {window:root,btoa:s=>Buffer.from(s,"binary").toString("base64")});
const text=root.EZ2Text;
const field=(value,widthMM=58,xMM=0)=>({
  id:"row",kind:"text",value,deviceFont:"A00",widthMM,xMM,yMM:0,
  heightMM:1.25,fixedRows:1,rotation:0,reversePrint:false
});
const doc=(widthMM,els)=>({
  widthMM,heightMM:38,gapMM:2,printMode:"text",elements:els
});
const d58=doc(58,[field("Х".repeat(58))]);
const planned=text.plan(d58);
assert.equal(planned.rows.length,1);
assert.equal(planned.rows[0].text.length,58);
assert.equal(planned.margins.width,58);
assert.equal(planned.rows[0].margin,1);
const packet=Buffer.from(text.build(d58).base64,"base64");
assert.equal(packet.subarray(0,12).toString("hex"),"1b46301b713034301b4d3031");
assert(packet.includes(Buffer.from([0x1b,0x41,0x30,0x30])),
  "Native A00 font command unchanged");
const at=packet.indexOf(Buffer.from([0x1b,0x41,0x30,0x30]));
assert.equal(packet.subarray(at+4,at+4+58).length,58);
assert.equal(packet[at+4+58],13,"Full 58-character row must end at CR");
const d60=doc(60,[field("Q".repeat(60),60)]);
assert.equal(text.plan(d60).rows[0].text.length,60);
const pos=doc(58,[field("X",1,57)]);
assert.equal(text.plan(pos).rows[0].margin,58,
  "Valid far-edge native position may exceed old M55 cap");
assert(Buffer.from(text.build(pos).base64,"base64")
  .includes(Buffer.from([27,77,53,56])),"Native M58 position is sent");
const inset=doc(58,[field("A".repeat(56),58)]);
inset.marginRightMM=2;
assert.equal(text.plan(inset).rows[0].text.length,56);
const overflow=doc(58,[field("A".repeat(57),58)]);
overflow.marginRightMM=2;
assert.throws(()=>text.build(overflow),/требует 2 строк/);
assert.throws(()=>text.plan(doc(58,[field("X",3,56)])),/ширин/);
assert.throws(()=>text.plan(doc(61,[field("X")])),/Ширина рулона/);
const html=fs.readFileSync("LabelDesk/Resources/editor.html","utf8");
assert.match(html,/numInput\(Number\(e\.widthMM\|\|doc\.widthMM\),n=>\{[\s\S]*?\},1,doc\.widthMM,1\)/);
assert.match(html,/const full=doc\.printMode==="text"\?doc\.widthMM:Math\.min\(55,doc\.widthMM\)/);
assert.match(html,/layout\.margins\.right,x:doc\.widthMM-layout\.margins\.right/);
assert.match(html,/if\(width>55\)/,"Raster ESC G55 unchanged");
const app=fs.readFileSync("LabelDesk/Resources/app.js","utf8");
assert.match(app,/CP866 — по ширине рулона; растр — до 55 мм/);
console.log("CP866 roll-width passed: 58/60 mm, M58, 58 bytes, margins, overflow and raster limit.");
