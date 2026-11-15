"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("LabelDesk/Resources/editor.html", "utf8");
const match = html.match(/function transformRect\([\s\S]*?(?=\nfunction startManipulation\()/);
assert.ok(match, "Pure resize function missing");
const resize = vm.runInNewContext(match[0] + "\ntransformRect");

const original = {xMM:3,yMM:4,widthMM:10,heightMM:8};
function equal(actual, expected, explanation) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), explanation);
}
equal(resize(original,3,2,"se",40,30,1,1),
      {xMM:3,yMM:4,widthMM:13,heightMM:10},"Southeast expansion");
equal(resize(original,-2,-3,"nw",40,30,1,1),
      {xMM:1,yMM:1,widthMM:12,heightMM:11},"Northwest expansion");
equal(resize(original,5,-1,"ne",40,30,1,1),
      {xMM:3,yMM:3,widthMM:15,heightMM:9},"Northeast expansion");
equal(resize(original,-2,3,"sw",40,30,1,1),
      {xMM:1,yMM:4,widthMM:12,heightMM:11},"Southwest expansion");
equal(resize(original,100,100,"se",40,30,1,1),
      {xMM:3,yMM:4,widthMM:37,heightMM:26},"Clamp to label edges");
equal(resize(original,-100,-100,"move",40,30,1,1),
      {xMM:0,yMM:0,widthMM:10,heightMM:8},"Clamp movement");
equal(resize(original,99,99,"move",40,30,1,1),
      {xMM:30,yMM:22,widthMM:10,heightMM:8},"Clamp moved object");
equal(resize(original,-99,-99,"se",40,30,1,1),
      {xMM:3,yMM:4,widthMM:1,heightMM:1},"Minimum dimensions");
assert.match(html, /if\(selected!==id\)\{\s*selected=id;/, "Canvas click explicitly selects its layer");
assert.match(html, /\.obj:not\(\.sel\):hover/, "Hover gives visible object target");
assert.match(html, /zoomMode==="fit"/, "Responsive fit zoom should exist");
assert.match(html, /ArrowLeft.*ArrowRight.*ArrowUp.*ArrowDown/, "Arrow keys should nudge objects");
assert.match(html, /for\(const corner of \["nw","ne","sw","se"\]\)/, "Four actual handles expected");
assert.match(html, /previousSelected=selected\?\.toLowerCase\(\)/, "Selection must survive save/reload");
assert.match(html, /visual\.style\.textAlign=e\.textAlignment\|\|"left"/,
             "HTML preview must use saved text alignment");
assert.match(html, /e\.textAlignment=mode/,
             "Inspector must update text alignment");
assert.match(html, /e\.xMM=Math\.max\(0,\(doc\.widthMM-e\.widthMM\)\/2\)/,
             "Selected block must support horizontal centering");
assert.match(html, /e\.yMM=Math\.max\(0,\(doc\.heightMM-e\.heightMM\)\/2\)/,
             "Selected block must support vertical centering");
assert.match(html,/numInput\(doc\.widthMM,n=>\{doc\.widthMM=n;\},10,60,0\.5\)/, "Physical media width must allow 60mm");
assert.match(html,/className="printzone"/, "Editor must hatch unreachable ESC G area");
console.log("Editor geometry smoke test passed: selection, media width, print-zone hatch, text and four-corner resizing.");
