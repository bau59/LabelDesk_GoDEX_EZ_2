"use strict";
// Resident-font preview must use the exact compiler dot grid, not CSS font widths.
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const root={};
for(const f of ["text-engine.js","food-presets.js"]){
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+f,"utf8"),
    {window:root,btoa:s=>Buffer.from(s,"binary").toString("base64")},{filename:f});
}
const app=fs.readFileSync("LabelDesk/Resources/app.js","utf8");
const html=fs.readFileSync("LabelDesk/Resources/app.html","utf8");
const match=app.match(/  function operatorNativeSVG\(doc,layout\)\{[\s\S]*?\n  \}\n  function renderOperatorPreview\(\)\{/);
assert(match,"Pure SVG preview helper exists before operator modal renderer");
const helper=match[0].slice(0,match[0].lastIndexOf("\n  function renderOperatorPreview"));
const esc=x=>String(x??"").replace(/[&<>"']/g,ch=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const render=new Function("esc","return ("+helper+")")(esc);
const doc=root.EZ2QualityPreset.build().templates[0];
const now=new Date(2026,10,21,17,7);
const layout=root.EZ2Text.plan(doc,{now});
const before=JSON.stringify(doc);
const svg=render(doc,layout);
assert.match(svg,/viewBox="0 0 464 240"/,"Actual 58x30 mm dot grid");
assert.match(svg,/lengthAdjust="spacingAndGlyphs"/,"Glyph runs must fit their native cells");
assert.match(html,/\.operator-native-svg\{display:block;width:100%;height:auto/);
assert(!html.includes(".operator-native-line{"),"No CSS text clip rectangles");
assert(!svg.includes("operator-native-line"),"No old absolute CSS text rows");
const expected=layout.rows.filter(r=>r.kind==="text"&&r.text.trim());
const actual=[...svg.matchAll(/<text x="(\d+)" y="([\d.]+)"[^>]*textLength="(\d+)"[^>]*>([^<]*)<\/text>/g)];
assert.equal(actual.length,2,"Exactly two visible text lines");
for(let i=0;i<actual.length;i++){
  const [,x,y,width,text]=actual[i],row=expected[i];
  assert.equal(text,row.text,"Full line appears without clipping");
  assert.equal(Number(x),(row.margin-1)*8,"Printer ESC Mnn determines X");
  assert.equal(Number(width),Array.from(row.text).length*row.font.widthDots,
    "True native character width in dots");
  assert(Number(x)+Number(width)<=doc.widthMM*8,"Text must fit label");
  assert(Number(y)<=doc.heightMM*8,"Text baseline must fit label");
}
assert.equal(actual[1][4],"Изготовлено и упаковано: 21.11.2026 17:07");
assert.equal(JSON.stringify(doc),before,"Preview must not change stored template");
const inverted=structuredClone(doc);
inverted.elements[1].reversePrint=true;
const invertedSVG=render(inverted,root.EZ2Text.plan(inverted,{now}));
assert.match(invertedSVG,/<rect x="\d+" y="\d+" width="\d+" height="30" fill="#111"\/>/);
assert.match(invertedSVG,/fill="#fff" font-family="Menlo/);
console.log("Operator CP866 SVG preview passed: full timestamp, native dot dimensions, no clipping, inverse.");
