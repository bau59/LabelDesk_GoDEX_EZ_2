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
  save(){} restore(){} beginPath(){} rect(){} clip(){} fillText(){}
  measureText(text){return {width:String(text).length*7};}
  strokeRect(x,y,w,h){
    const thickness=Math.max(1,Math.ceil(this.lineWidth||1));
    const before=this.fillStyle;this.fillStyle="#000";
    this.fillRect(x,y,w,thickness);this.fillRect(x,y+h-thickness,w,thickness);
    this.fillRect(x,y,thickness,h);this.fillRect(x+w-thickness,y,thickness,h);
    this.fillStyle=before;
  }
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
assert.equal(encode(wrong).rows,280,"Gap affects ESC qNNN, not 38-mm raster");
const shorter=blank();shorter.heightMM=30;
assert.doesNotThrow(()=>window.EZ2Raster.draw(shorter));
assert.equal(encode(shorter).rows,216,"30-mm label retains the 3-mm bottom safety margin");
const taller=blank();taller.heightMM=60;
taller.elements=[{kind:"line",xMM:1,yMM:50,widthMM:3,heightMM:1}];
assert.equal(encode(taller).rows,456);
assert.throws(()=>encode({...taller,elements:[{kind:"line",xMM:1,yMM:58,widthMM:3,heightMM:1}]}),/ниже 57/);
assert.throws(()=>encode({...blank(),gapMM:0}),/зазор/);

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

const framed=blank();
framed.elements=[{id:"frame",kind:"framedText",value:"",fontSize:12,
  frameBorderMM:0.25,framePaddingMM:1.5,xMM:2,yMM:4,widthMM:36,heightMM:18}];
const framedPacket=bytes(encode(framed));
const frameWidth=Number(framedPacket.toString("ascii",2,4));
const frameStride=4+frameWidth;
assert.ok(framedPacket.subarray(33*frameStride+4,35*frameStride+4+frameWidth)
  .some(x=>x!==0),"Box border must be emitted as real ESC G pixels");
assert.throws(()=>window.EZ2Raster.draw({...framed,
  elements:[{...framed.elements[0],framePaddingMM:12}]}),/Отступ внутри рамки/);
const clipped=blank();
clipped.elements=[{id:"clipped",kind:"text",fontSize:12,value:"строка 1\nстрока 2\nстрока 3",
 xMM:2,yMM:2,widthMM:40,heightMM:2}];
assert.throws(()=>encode(clipped),/не помещается по высоте/,
 "Text may never be silently cut to the frame height");
const clippedFrame=blank();
clippedFrame.elements=[{id:"frameClip",kind:"framedText",fontSize:12,value:"строка 1\nстрока 2",
 frameBorderMM:0.25,framePaddingMM:1,xMM:2,yMM:2,widthMM:32,heightMM:5}];
assert.throws(()=>encode(clippedFrame),/не помещается по высоте/,
 "Framed content must have the same overflow protection");
console.log("Web raster passed: Gnn+FF, full-height rows, Code128/EAN13 bitmap generation.");
