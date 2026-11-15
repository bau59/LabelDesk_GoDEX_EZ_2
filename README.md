# LabelDesk — GoDEX EZ-2 on Intel macOS

Native SwiftUI label editor, local queue and serial ESC printing. Requires macOS 15+, Intel x86_64. No Go, server, CUPS or printer driver.

## Install and updates

Download the latest Intel DMG from https://github.com/bau59/LabelDesk_GoDEX_EZ_2/releases/latest. Install by copying LabelDesk.app into Applications. Starting in v0.4.0, the app checks GitHub Releases daily and by button. With user confirmation it downloads the Intel ZIP, requires a SHA-256 release digest, verifies the signed bundle and x86_64 binary, closes, replaces the installed app using a detached helper, and relaunches it. The helper keeps a rollback copy until installation is verified. Install v0.4.0 once manually if currently running v0.3.0. Builds are ad-hoc signed, not notarized.

## Verified hardware

- GoDEX EZ-2 (original 2002 ESC command set; NOT modern EZPL).
- USB–RS232 Prolific PL2303, USB IDs 067b:2303, device path typically /dev/cu.usbserial-1430.
- RS-232: 9600 baud, 8 data bits, no parity, 1 stop bit; None was used for the successful short TEST. XON/XOFF and RTS/CTS are available in settings.
- Print TEST retains the original physically verified ESC command sequence. The printer printed TEST and advanced the paper.

## Printhead and raster constraints

| Setting | Limit |
|---|---|
| Maximum material width | 60 mm |
| Physical printhead | 56 mm = 448 dots |
| Resolution | 203 dpi = 8 dots/mm |
| Maximum ESC G row | 55 bytes = 440 dots = 55 mm |
| Editor label width | 10–55 mm |
| Editor label height | 10–100 mm (conservative initial software cap) |
| Gap | 0–10 mm, whole millimeters |

The raster uses one ESC Gnn command per row with nn raw monochrome bytes (1 = black), a 1 mm left-margin command, ESC q with the full label height plus gap, and FF. ESC Q176 is the previously tested default top-of-form value for text and raster, now adjustable for raster jobs. ESC Q and ESC q are different instructions. A 55 mm raster is *not* the same as a 60 mm printable area.

## Version 0.7.0 — folders, base templates and quick print

LabelDesk now separates designing a template from operating the printer:

1. Create or open a label in **Редактор**. For each text layer that should change, check **Менять при печати** and optionally give it a clear field name, such as `Цена`, `Товар` or `Размер`. Text layers marked static stay locked in quick mode.
2. Click the new-folder button in the left **Библиотека**, enter a folder name. LabelDesk saves an **independent copy of the currently open layout** as that folder's base template.
3. Select a folder. **Заполнение** shows only variable text fields, number of copies and a true CoreGraphics monochrome print preview. The font, geometry, barcode, constant text and base file cannot be modified here.
4. Click **Добавить этикетку** to queue the filled label. Start the queue separately, after the established raster and feed verification gates. The queued job contains its own snapshot of the filled label.
5. For a list of product names, paste one name per line into **Пакетная печать списком**, choose the field to replace, and queue up to 200 labels at once. The other fields retain their current quick-form values. This is a single-column workflow, **not yet a full CSV/Excel importer**.
6. **Сохранить как вариант** creates a separate saved filled template without overwriting the base. In the folder's templates menu, you can duplicate, move, set as base, edit or delete non-base templates.

Folders are logical records in `~/Library/Application Support/LabelDesk/folders.json`, referenced by UUID in saved template JSON files under `templates/`. This avoids breaking the existing v0.1–v0.6 file library. Existing templates without a folder ID appear under **Без папки**. Deleting a folder **never deletes its templates**: they become ungrouped. A folder's active base template cannot be deleted until another base has been assigned.

All source templates remain unchanged by quick printing. Serial transfer settings, original Print TEST, font/raster/feed tests, queued-print safeguards, HTML designer and self-updater are retained from 0.6.0.

Planned separately after real-printer feedback: CSV/Numbers import, serial counters, date fields, recently printed templates and hybrid native ASCII/raster printing. These are not claimed as part of 0.7.0.
## Version 0.6.0 — persistent selected layer, resize handles and EZ-2 settings

- Layer selection is explicit: choose a layer on the left. Canvas clicks on other layers never automatically change selection. Adding an object selects the new layer.
- The selected layer has four functional resizing handles (NW, NE, SW, SE) with boundaries, min sizes and 1-mm snapping (0.125 mm without snapping). Moving and resizing update the inspector when the gesture ends rather than repeatedly recreating its inputs.
- Editable text keeps focus while typing; selection is preserved after saving and UUID case normalization when Swift reloads the document.
- Printer Settings has separate tabs for serial connection, print quality/speed, paper & alignment, and native printer capabilities.
- ESC D0–D7 sets thermal darkness; S0 or S1 selects 1 or 2 inches/sec. Software raster threshold is adjustable 64–192. Printer resolution is fixed at 203 dpi.
- Optional sensor F0 (gap) or F1 (reflective black mark), otherwise the printer's current sensor setting is unchanged. Q top-of-form position is adjustable (default 176); changing it or the sensor setting invalidates the previously confirmed Feed TEST.
- Existing JSON settings from v0.1–v0.5 migrate without losing the serial port.

### Native font feasibility

The original EZ-2/4 (2002) manual confirms built-in ASCII 8×10 (ESC A00), default 16×26 (ESC A11), character expansion (ESC Ahv), ASCII styles (ESC A0n), Code39/Code128 barcodes and regional character sets via ESC In. These regional tables do not include Russian Cyrillic.

Use the explicitly confirmed **Font TEST** button for a one-label experiment with the two built-in ASCII sizes. This test does not enable native or hybrid printing of layouts. Native ASCII printing can be faster than full raster, but this printer has **line mode**, not general x/y overlay compositing. Mixing native text and raster safely would require a separate, physically verified print strategy for sequential non-overlapping sections. Cyrillic stays rasterized until proven otherwise.

Protocol reference: https://www.manualslib.com/manual/302891/Godex-Ez-2.html (pages 12–19).
## Version 0.5.0 — HTML editor and paper feed

The old SwiftUI canvas and inspector are replaced by an **offline HTML/JavaScript editor embedded in WKWebView**. SwiftUI continues to manage saved templates, printer settings, print queue and release updates. No server, remote assets, CDN, Electron or JavaScript dependencies.

- **Layers:** click any object, reorder it using arrows, duplicate or delete.
- **Canvas:** drag objects, use a millimetre grid and adjustable zoom.
- **Inspector:** edit text in a real textarea (double-click a text object to focus it), barcode values, position, size, font size and weight, and rotation.
- **Undo/redo**, Cmd+S to save and existing JSON template compatibility.

### Paper-feed validation

The user reported that full raster labels stopped at the last raster row instead of positioning the next label, although the original text TEST and Raster TEST advanced correctly.

Version 0.5 restores **ESC Q176** from the physically verified tests before the existing **ESC qNNN** (label height plus gap) and final form feed. It deliberately does **not** append an arbitrary ESC fNN movement, which could skip labels. Q176 is a setting that worked for the user's test roll, not a universal constant for every label size.

Choose your actual label height and gap, press **Feed TEST** to print a single small raster, and confirm only if the paper reaches the start of the next label. The queue is locked until this new feed-alignment test has been confirmed. If the test fails, report material dimensions and the exact stopping position before changing commands again.

### Serial speed

The tested RS-232 speed is 9600 baud. Full-width 55 mm raster data is inherently slow at that bit rate. The encoder now removes **trailing white bytes on each raster row** while preserving leading whitespace and row count. A blank row uses ESC G01 followed by a zero byte. This reduces sparse label transfers significantly, but full-width graphical borders still require substantial data.

Packet tests verify that only trailing zero bytes are dropped. The optimized raster output still requires physical validation on the EZ-2. Do not increase the adapter baud rate unless the printer's serial configuration is changed accordingly.
## How to test version 0.3.0

1. Select your USB serial port under Printer settings and save; old settings migrate from the working TEST app.
2. Press Print TEST for the already verified text command.
3. Press Raster TEST, which sends 40 rows of ESC G05 representing a small black L with a separate upper-right mark. Check the actual paper for a correctly oriented L and upper-right marker. This graphics command has NOT yet been physically verified on the user's unit.
4. Only if the square is correct, press Raster TEST looks correct and confirm. This locally unlocks printing full layouts.
5. Create a label, choose a preset, drag objects, edit coordinates or text in the inspector, and save the template.
6. Add the layout to the queue, choose copies and press Start queue. Jobs send sequentially. Failure states must be inspected before retrying, to avoid duplicate labels.

If the raster test is reversed, prints gibberish, stays blank or feeds unexpectedly, DO NOT confirm raster mode. Report the observed result before trying a full label.

## Supported editor features

- Text, including Cyrillic rasterized with macOS fonts.
- Actual Code 39 narrow/wide bars and human-readable captions, subject to minimum 2-dot bar width.
- Lines and rectangles, physical mm dimensions, presets, custom sizes, zoom, grid and object dragging.
- Local JSON templates and persisted print queue.
- Density and flow control settings; X/Y raster correction, material gap, manual calibration instructions.
- App update checks from versioned GitHub Releases.

The **HTML editor canvas** is an interactive layout preview; actual output is rasterized separately in Swift/CoreGraphics at 8 dots/mm, so typography may differ slightly due to font metrics. Printing is guarded by the raster and new feed-alignment tests.

## Limitations

- ESC G printing and alignment still need validation on physical EZ-2 hardware. The command structure follows the original 2002 manual, but the real printer may need corrections.
- The printer has a mechanical label-gap sensor adjustment (VR). LabelDesk does not claim automatic electronic calibration.
- A successful serial write is not a printer acknowledgement: Sent means the bytes were transmitted, not that paper output was confirmed.
- For large raster transfers use XON/XOFF if the device responds correctly, or the supported wired hardware flow-control mode.
- No imported images, QR, database integration or notarized Apple Developer ID distribution yet.
- Automatic installation requires LabelDesk.app in /Applications or ~/Applications and a writable destination. When macOS permissions do not allow replacement, install the DMG manually. There is no privilege escalation.
- Updater logs: ~/Library/Logs/LabelDesk/updater.log. Save current edits and finish active print jobs before an update.

## Build

Run: zsh Scripts/build-installer.sh

GitHub Actions builds for macos-15-intel and runs an encoder smoke test before releasing new versions. Build output includes a DMG and an Intel app ZIP.

## Original reference

GoDEX EZ-2/4 User Manual (April 2002): https://www.manualslib.com/manual/302891/Godex-Ez-2.html
