"use strict";
// CI only. Standard barcode vectors + explicit original 2002 EZ-2 protocol framing.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const window={};
const ctx={window,btoa:s=>Buffer.from(s,"binary").toString("base64")};
for(const file of ["barcodes.js","native.js"])
  vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/"+file,"utf8"),ctx,{filename:file});
const {generate,layout,checksumEAN}=window.EZ2Barcodes;
assert.equal(checksumEAN("590123412345"),"7");
const e13=generate("EAN13","590123412345");
assert.equal(e13.display,"5901234123457");
assert.equal(e13.bits.length,95);
assert.equal(e13.bits.slice(0,3),"101");
assert.equal(e13.bits.slice(45,50),"01010");
assert.equal(e13.bits.slice(-3),"101");
assert.throws(()=>generate("EAN13","5901234123456"),/контрольная/);
const e8=generate("EAN8","9638507");
assert.equal(e8.display,"96385074");
assert.equal(e8.bits.length,67);
assert.throws(()=>generate("EAN8","96385075"),/контрольная/);
const c39=generate("CODE39","ABC-123");
assert.equal(c39.display,"ABC-123");
assert.ok(c39.bits.length>100);
assert.throws(()=>generate("CODE39","Привет"),/Code 39/);
const c128=generate("CODE128","123456");
assert.equal(c128.checksum,44);
assert.equal(c128.subset,"C");
assert.equal(c128.bits.length,68);
assert.equal(generate("CODE128","ABc12").subset,"B");
assert.throws(()=>generate("CODE128","АБВ"),/ASCII/);
assert.equal(layout("CODE128","123456",440).moduleDots>=2,true);
assert.throws(()=>layout("CODE39","ABCDEFGHIJK",120),/недостаточно ширины/);

const doc=(kind,more={})=>({
  widthMM:58,heightMM:38,gapMM:2,
  elements:[{
    kind,id:"1",xMM:0,yMM:3,widthMM:55,heightMM:8,value:"TEST",rotation:0,
    fontSize:12,renderMode:"device",deviceFont:"A11",
    barcodeType:"CODE39",showsHumanReadable:true,...more
  }]
});
const native=window.EZ2Native;
const txt=Buffer.from(native.packet(doc("text")).base64,"base64");
assert.equal(txt.subarray(0,12).toString("hex"),"1b46301b713034301b4d3031");
assert.ok(txt.includes(Buffer.from([27,66,27,65,49,49,84,69,83,84,13])));
assert.equal(txt.subarray(-6).toString("hex"),"1b451b503031");
assert.throws(()=>native.packet(doc("text",{value:"Привет"})),/ASCII/);
const cp437=Buffer.from(native.packet(doc("text",{value:"┌─┐"})).base64,"base64");
assert.ok(cp437.includes(Buffer.from([218,196,191])),"Firmware line glyphs use CP437 bytes, not UTF-8");
assert.throws(()=>native.packet({...doc("text"),elements:[...doc("text").elements,...doc("text").elements]}),/один блок/);
const code39=Buffer.from(native.packet(doc("barcode",{value:"1234"})).base64,"base64");
assert.ok(code39.includes(Buffer.from([27,63,51,27,66,27,65,49,49,27,123,49,50,51,52,125,13])));
assert.ok(!code39.includes(Buffer.from([27,71])),"No raster Gnn within native command");
assert.throws(()=>native.packet(doc("barcode",{barcodeType:"CODE128"})),/только Code 39/);
assert.throws(()=>native.packet(doc("barcode",{value:"Привет"})),/Code 39/);
assert.throws(()=>native.packet(doc("text",{xMM:5})),/левого края/);
assert.throws(()=>native.packet(doc("text",{renderMode:"auto"})),/Встроенный ASCII/);
const html=fs.readFileSync("LabelDesk/Resources/editor.html","utf8");
assert.match(html,/barcodeType:"CODE128"/,"New barcode element defaults to Code128");
assert.match(html,/const full=Math\.min\(55,doc.widthMM\)/,"New block width defaults to print width");
assert.match(html,/EAN-13 \(с контрольной цифрой\)/);
assert.match(html,/Текст CP866/);
const app=fs.readFileSync("LabelDesk/Resources/app.html","utf8");
assert.match(app,/<script src="barcodes.js"><\/script>/);
assert.match(app,/<script src="native.js"><\/script>/);
console.log("Barcode and native protocol passed: Code39, Code128B/C, EAN8/EAN13, checksums, native packet isolation.");
