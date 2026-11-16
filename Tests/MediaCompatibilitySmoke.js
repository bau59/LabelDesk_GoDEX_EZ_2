// Run only on CI (Node is not needed on the user's Mac).
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const window={};
const context={window,document:{createElement:()=>({})}};
vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/raster.js","utf8"),context);
const {mediaFromProfile,validateMedia,compatibility,transportReady}=window.EZ2Raster;
const defaults=mediaFromProfile({});
assert.equal(JSON.stringify(defaults),JSON.stringify({widthMM:58,heightMM:38,gapMM:2}));
const label={id:"keep",widthMM:58,heightMM:38,gapMM:2,elements:[]};
const original=JSON.stringify(label);
assert.equal(compatibility(label,defaults).ok,true);
const narrower=validateMedia({widthMM:50,heightMM:38,gapMM:2});
assert.equal(compatibility(label,narrower).ok,false);
assert.match(compatibility(label,narrower).reason,/58×38/);
assert.equal(JSON.stringify(label),original,"Compatibility must never alter a template");
assert.equal(compatibility({...label,widthMM:50},narrower).ok,true);
assert.equal(compatibility({...label,widthMM:50,gapMM:3},narrower).ok,false);
assert.equal(compatibility({...label,heightMM:30},defaults).ok,false);
const differentGap=validateMedia({widthMM:58,heightMM:38,gapMM:3});
assert.equal(compatibility({...label,gapMM:3},differentGap).ok,true);
assert.equal(transportReady(differentGap),false,"Unverified transport must be disabled");
assert.equal(transportReady(defaults),true);
assert.equal(transportReady({widthMM:50,heightMM:38,gapMM:2}),true);
assert.equal(transportReady({widthMM:58,heightMM:40,gapMM:2}),false);
assert.throws(()=>validateMedia({widthMM:0,heightMM:38,gapMM:2}),/Рулон/);
assert.throws(()=>validateMedia({widthMM:58,heightMM:38.5,gapMM:2}),/Рулон/);
const app=fs.readFileSync("LabelDesk/Resources/app.js","utf8");
const html=fs.readFileSync("LabelDesk/Resources/app.html","utf8");
const editor=fs.readFileSync("LabelDesk/Resources/editor.html","utf8");
for(const name of ["mediaWidth","mediaHeight","mediaGap","quickCompatibility","editorCompatibility","queueCompatibility"])
  assert.ok(html.includes('id="'+name+'"'),"Missing UI "+name);
assert.ok(app.includes('widthMM:media().widthMM'),"New templates must use media settings");
assert.ok(app.includes('EZ2Raster.compatibility(doc,media())'),"Compatibility must be centralized");
assert.match(app,/state\.jobs\.filter\(j=>j\.state==="pending" && canPrint\(j\.document\) &&/,
  "Queue must skip incompatible jobs without changing their state");
assert.ok(app.includes("(!wanted||wanted.has(j.id))"),
  "A diagnostic print must not send unrelated queued jobs");
assert.ok(editor.includes('width>printerMedia.widthMM'),"Red boundary must follow media width");
assert.ok(editor.includes('height>printerMedia.heightMM'),"Red boundary must follow media height");
assert.ok(editor.includes('className="printzone"'),"Separate ESC G55 guide remains");
console.log("Media compatibility passed: settings, existing labels untouched, queue blocking, editor guides.");
