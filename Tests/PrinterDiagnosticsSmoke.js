// Verifies every selectable calibration sheet without using the serial port.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const window={};
const ctx={window,btoa:s=>Buffer.from(s,"binary").toString("base64")};
for(const p of ["barcodes.js","text-engine.js","diagnostics.js"])
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+p,"utf8"),ctx,{filename:p});
const tests=window.EZ2Diagnostics.list();
assert(tests.length>=18,"Font atlas, CP866, geometry and barcode sheets must exist");
assert.equal(new Set(tests.map(t=>t.id)).size,tests.length);
for(const name of ["Символы","Шрифты","Геометрия","Режимы","Штрихкоды"])
  assert(tests.some(t=>t.group===name),name);
for(const sample of tests){
  const doc=window.EZ2Diagnostics.documentFor(sample.id);
  assert.equal(doc.name.startsWith("ТЕСТ "+sample.id),true,sample.id);
  assert.equal(doc.widthMM,58);
  assert.equal(doc.heightMM,38);
  assert.equal(doc.gapMM,2);
  assert(doc.elements.length>0,sample.id);
  if(doc.printMode==="text"){
    const layout=window.EZ2Text.plan(doc);
    assert(layout.usedDots<=256,sample.id+" overheight");
    const packet=window.EZ2Text.build(doc,1);
    assert(packet.size<8192,sample.id+" too large");
    assert.equal(Buffer.from(packet.base64,"base64").at(-1),49,sample.id+" count digit");
  }else{
    for(const item of doc.elements){
      assert(item.xMM>=0&&item.yMM>=0,sample.id);
      assert(item.xMM+item.widthMM<=55.001,sample.id+" x limit");
      assert(item.yMM+item.heightMM<=35.001,sample.id+" y limit");
      if(item.kind==="barcode")
        assert.doesNotThrow(()=>window.EZ2Barcodes.layout(
          item.barcodeType,item.value,item.widthMM*8),sample.id);
    }
  }
}
assert(!tests.some(t=>t.document?.nativeTrial),"Normal diagnostics must not bypass queue");
console.log("Diagnostics passed:",tests.length,"one-label, measured specimens.");
