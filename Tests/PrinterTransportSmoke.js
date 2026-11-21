// Regression: EZ-2S printer startup must not consume a label.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const script = fs.readFileSync("Scripts/printer.sh", "utf8");
const bridge = fs.readFileSync("LabelDesk/App/WebLabelDeskBridge.swift", "utf8");
const app = fs.readFileSync("LabelDesk/Resources/app.js", "utf8");

assert.match(script, /"\$1" == "--init"/);
assert.match(script, /usage: printer\.sh --init PORT PITCH/);
assert.match(script, /PITCH="\$5"/);
assert.match(script, /if \[\[ "\$MODE" == "init" \]\]; then[\s\S]*?printf '\\033q%03d' "\$PITCH" >&3/);
assert.match(script, /printf '\\033F0\\033q%03d\\033M01' "\$PITCH" >&3/);
assert.doesNotMatch(script, /T3 sent|blank 280-row|blank separator|G10 x 280/i);
assert.doesNotMatch(script, /printf '\\014' >&3/);

assert.match(bridge, /case "initPrinter":/);
assert.match(bridge, /"--init", port, String\(pitchMM\)/);
assert.match(bridge, /pitchMM == 40, copies == 1/);
assert.match(bridge, /String\(format: "%03d", pitchMM\)/);
assert.match(bridge, /"printer\.sh"\)\.path/);
assert.match(app, /native\("initPrinter",\{port:state\.profile\.portPath,pitchMM\}\)/);
assert.match(app, /native\("initPrinter",\{port,pitchMM\}\)/);
assert.doesNotMatch(app, /firstRaster|first:!textMode/);
console.log("Printer startup and queue transport regression passed.");
