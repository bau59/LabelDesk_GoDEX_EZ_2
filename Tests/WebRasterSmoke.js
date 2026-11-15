// Runs in GitHub Actions only; Node is NOT required by the installed app.
// Tests the exact Gnn packets produced by the browser renderer with fake pixels.
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

class FakeCanvas {
  width = 0;
  height = 0;
  constructor() { this.ctx = new FakeContext(this); }
  getContext() { return this.ctx; }
}
class FakeContext {
  constructor(canvas) { this.canvas = canvas; this.fillStyle = "#000"; this.data = null; }
  getImageData() {
    if (!this.data) this.data = new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4);
    return { data: this.data };
  }
  fillRect(x,y,w,h) {
    const { width, height } = this.canvas;
    const data = this.getImageData().data;
    const value = this.fillStyle === "#fff" ? 255 : 0;
    for (let yy=Math.max(0,Math.floor(y));yy<Math.min(height,Math.ceil(y+h));yy++){
      for (let xx=Math.max(0,Math.floor(x));xx<Math.min(width,Math.ceil(x+w));xx++){
        const i=(yy*width+xx)*4;
        data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255;
      }
    }
  }
  save(){} restore(){} beginPath(){} rect(){} clip(){} strokeRect(){} fillText(){}
}
const window = {};
const context = { window, document: {createElement: type=>{
  assert.equal(type,"canvas");return new FakeCanvas();
}}, btoa: str=>Buffer.from(str,"binary").toString("base64") };
vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/barcodes.js","utf8"),context);
vm.runInNewContext(fs.readFileSync("LabelDesk/Resources/raster.js","utf8"),context);
const {encode}=window.EZ2Raster;
const blank = ()=>({id:"test",name:"Test",widthMM:58,heightMM:38,gapMM:2,elements:[]});
function bytes(result){return Buffer.from(result.base64,"base64");}

let packet=bytes(encode(blank()));
assert.equal(packet.length,280*14+1);
assert.equal(packet[packet.length-1],12);
for(let y=0;y<280;y++){
  const row=packet.subarray(y*14,y*14+14);
  assert.deepEqual(Array.from(row.subarray(0,4)),[27,71,49,48]);
  assert.ok(row.subarray(4).every(byte=>byte===0));
}

const short=blank();
short.elements=[{kind:"line",xMM:0,yMM:0,widthMM:1,heightMM:1,value:""}];
packet=bytes(encode(short));
assert.equal(packet.length,280*14+1);
assert.equal(packet[4],255,"First line has eight black pixels");
assert.equal(packet[4+14*20],0,"Blank rows remain white");

const wide=blank();
wide.elements=[{kind:"line",xMM:54,yMM:0,widthMM:1,heightMM:1,value:""}];
packet=bytes(encode(wide));
assert.equal(packet.length,280*59+1);
assert.deepEqual(Array.from(packet.subarray(0,4)),[27,71,53,53]);
assert.equal(packet[4+54],255);

const low=blank();
low.elements=[{kind:"line",xMM:2,yMM:36,widthMM:10,heightMM:1,value:""}];
assert.throws(()=>encode(low),/ниже 35/);
const right=blank();
right.elements=[{kind:"line",xMM:56,yMM:2,widthMM:1,heightMM:1,value:""}];
assert.throws(()=>encode(right),/правее 55/);
const wrong=blank();wrong.gapMM=3;
assert.doesNotThrow(()=>window.EZ2Raster.draw(wrong),"Old incompatible stock must remain previewable");
assert.throws(()=>encode(wrong),/проверена только/);
const shorter=blank();shorter.heightMM=30;
assert.doesNotThrow(()=>window.EZ2Raster.draw(shorter));
assert.throws(()=>encode(shorter),/проверена только/);

// The same shared generator must also drive actual ESC Gnn bitmap rows.
const barcodeLabel=blank();
barcodeLabel.elements=[{kind:"barcode",barcodeType:"CODE128",value:"1234567890",
  showsHumanReadable:false,xMM:0,yMM:3,widthMM:55,heightMM:12}];
const barcodePacket=bytes(encode(barcodeLabel));
assert.equal(barcodePacket[barcodePacket.length-1],12);
assert.ok(barcodePacket.length>280*14,"Barcode must be transmitted in image rows");
const bwidth=(barcodePacket[2]-48)*10+(barcodePacket[3]-48);
const bstride=4+bwidth;
assert.ok(barcodePacket.subarray(25*bstride+4,25*bstride+4+bwidth).some(x=>x!==0),
  "Code128 bars must appear at the correct 3mm vertical position in real printed bytes");
const eanLabel=blank();
eanLabel.elements=[{kind:"barcode",barcodeType:"EAN13",value:"590123412345",
  showsHumanReadable:false,xMM:0,yMM:3,widthMM:55,heightMM:12}];
assert.doesNotThrow(()=>encode(eanLabel),"EAN13 barcode should render into real raster");

console.log("Web raster passed: Gnn+FF, full-height rows, Code128/EAN13 bitmap generation.");
