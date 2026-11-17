// Regression: EZ-2S printer startup must not consume a label.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const script = fs.readFileSync("Scripts/printer.sh", "utf8");
const bridge = fs.readFileSync("LabelDesk/App/WebLabelDeskBridge.swift", "utf8");
const app = fs.readFileSync("LabelDesk/Resources/app.js", "utf8");

assert.match(script, /"\$1" == "--init"/);
assert.match(script, /if \[\[ "\$MODE" == "init" \]\]; then[\s\S]*?printf '\\033q040' >&3/);
assert.match(script, /printf '\\033F0\\033q040\\033M01' >&3/);
assert.doesNotMatch(script, /T3 sent|blank 280-row|blank separator|G10 x 280/i);
assert.doesNotMatch(script, /printf '\\014' >&3/);

assert.match(bridge, /case "initPrinter":/);
assert.match(bridge, /"--init", port/);
assert.match(bridge, /"printer\.sh"\)\.path/);
assert.match(app, /native\("initPrinter",\{port:state\.profile\.portPath\}\)/);
assert.match(app, /native\("initPrinter",\{port\}\)/);
assert.doesNotMatch(app, /firstRaster|first:!textMode/);
console.log("Printer startup and queue transport regression passed.");
