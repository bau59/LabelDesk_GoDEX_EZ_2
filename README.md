# LabelDesk — original GoDEX EZ-2 on macOS (WebKit + zsh)

## Native CP866 inverse padding (1.0.27)

For a native text field with **Чёрная плашка (инверсия)** enabled, the editor offers **Отступ слева, симв.** and **Отступ справа, симв.** (0–12 character cells each). They map to optional `inversePadLeft` and `inversePadRight` fields. One cell is the native font's width in printer dots, e.g. 1 mm for A03. Each side is part of the reverse `ESC V` row, including blank cells, and the full padded string is validated against print width and fixed-height text slots. The right pad is appended *after* `wrapText`, which otherwise strips trailing blanks. User-typed trailing spaces are also retained for inverted fields, while normal text wrapping remains unchanged. This applies equally to automatic date/time fields and free text. The two previews derive their width from the same native line planner.

Existing labels with no padding properties use zero padding. If a one-line field no longer fits after pads, print compilation reports an overflow rather than silently clipping or moving subsequent fields. **Hardware validation is still needed:** the bytes for trailing inverted blanks are present in the packet, but some printer firmware may render trailing blank cells differently. No changes to the serial transport, media calibration or existing label content are made.


## Toolbar zoom/dropdown layout fix (1.0.26)

The **Вписать** zoom button now sizes to its text (minimum 84px); only zoom **−** and **+** remain fixed-width 38px icon buttons. This prevents the zoom caption spilling into the adjacent redo button. The **Ещё** disclosure arrow is a CSS chevron aligned to the center of its 38px control, rotated when expanded; no OS font-dependent arrow glyph. The toolbar can wrap as needed at narrower widths. These are editor-only changes and do not affect the EZ-2 printer protocol.


## Toolbar contrast and sizing fix (1.0.25)

The editor toolbar controls now share 38px height and 12px label text. The primary **＋ Текст** button has explicit sufficiently specific color, dark background, and visible hover/focus colors, overriding the older `.tools button[data-add]` white background. Secondary actions, **Ещё**, list and undo/redo/zoom controls use a consistent neutral treatment. Only editor styles were changed; printer commands and saved data were not modified.

## Editor interface refresh (1.0.24)

The editor is now centered on **add → select → edit**. The toolbar shows **Этикетка**, **＋ Текст**, **▥ Штрихкод**, and **Ещё** for less common object types; zoom and undo are on the right. Other tools remain available behind the expandable menu. Selecting **Этикетка** opens concise physical width/height/gap controls, with printer mode, margins, and grid behind **Режим и дополнительные настройки**.

Selecting native CP866 text shows its content or print-time date/time, a simple font selector, alignment, width, and fixed row count first. Variable fields are explicitly named **Заполнять перед печатью**; optional glyphs, X/Y font scales and catalog field mapping are under **Дополнительно**. Existing template structure remains intact.

The layer list now shows actual line content and names blank fixed-row spacers (e.g., **Отступ сверху · 9 строк**). Invisible blank spacer boundaries are hidden when unselected, but their printer-reserved heights are unchanged. The footer and capacity status now provide concise, correct information for every label height, instead of the old hard-coded 38 mm limit. This release changes only `editor.html`; no EZ-2 driver, encoder, media configuration, or saved labels are migrated.


## Operator CP866 preview fix (1.0.23)

The operator print dialog now uses a responsive SVG viewBox of `label.widthMM × 8` by `label.heightMM × 8` dots. Every resident-font row uses exactly the positions (`Mnn`), widths (`character count × font.widthDots`), row heights, and reverse-print information from `EZ2Text.plan()`. SVG `textLength` and `lengthAdjust="spacingAndGlyphs"` keep preview text inside its actual allocated font cells, avoiding the old clipping of “Контроль качества пройден” and full production date/time. There is no CSS font-size guess for print geometry. Text glyph shapes are still approximate; output packets, stored templates, and printer commands are unchanged.


## Operator print form and CP866 editor controls (1.0.22)

Open **Редактор этикеток → [saved label] → Печатать**. A dedicated operator form opens without editing the original document or creating an item in the catalog:

- **Editable fields** appear only for the template's text/barcode fields with \`isVariable!==false\`. Saved literal text remains fixed. Existing placeholders are not printed; empty fields render blank rows and empty barcodes are omitted.
- **Production/packing date-time** for a \`dynamicValue:"printDateTime"\` element can use the Mac local clock at job creation or an explicit operator-supplied local date-time. The formatted value is **frozen in the queued document snapshot**; replay does not unexpectedly change the production date. Saved templates retain the dynamic marker.
- **Preview** uses the real EZ-2 text row planner (horizontal margins, resident font metrics, wrapping, inversions, fixed line slots) or the normal raster renderer. CP866 glyph outlines in the form are illustrative; the native serial encoder remains the source of truth. Incompatible media, invalid dates and overflowing text prevent sending.
- **1–200 copies**; choose **В очередь** to store without sending or **Печатать** to send *only* the new job. Existing queued jobs stay intact; there is no claim of physical completion without printer feedback.
- In the native CP866 editor, fonts \`A11..A48\` now expose separate **X 1–4 / Y 1–8** controls. These generate only existing documented \`Axy\` codes. The inspector reports current dot dimensions, character capacity and fixed field height. \`A00..A04\` remain separate preset font codes.

No changes to \`printer.sh\`, transport calibration, \`ESC qNNN\`, or stored template schema are required. Stock other than the physically verified 38+2 mm still requires a single-label positioning test.


## Direct template batches (1.0.21)

The template library now has a **Тираж** count (1–200) and **Печатать** action on each saved label. This prints the selected saved document directly, without selecting or creating any item in the catalog. It uses the existing validated `queueDocument` and isolated `printQueue(true,[jobID])` flow, so earlier queued jobs are not transmitted. Existing documents are not modified. Unsupported roll dimensions and printer errors are still reported.

For the **Контроль качества · 58×30** text template, one buffered CP866 packet includes the current Mac-local date/time and the native copy count, so every label of the same batch has the same production/packing timestamp. If the count exceeds 200, split it into separate batches. Confirm the physical stock/registration on one label before large production runs.


## Quality control label, 58×30 mm (1.0.20)

**Этикетки → Контроль качества → Контроль качества · 58×30** is installed once as an ordinary editable template (separate version marker `qualityPresetPack`). It has two centered, visible CP866 lines:

```
Контроль качества пройден
Изготовлено и упаковано: 21.11.2026 13:47
```

The second line contains an explicit `dynamicValue:"printDateTime"` field: the date/time shown above is only an example. At every print, the native text compiler formats the Mac's **current local time**, without modifying saved label JSON or queued template snapshots. The inspector exposes a checkbox to disable or enable automatic date/time for this element. The layout uses native blank top rows to center the two printed lines; there are no extra feed commands.

To print, change **Настройки EZ-2 → Рулон** to width **58**, height **30**, gap **2**, save the settings, select the matching label and use **Пробная печать · 1 шт.**. This media's actual positioning has not yet been verified on the physical printer. Existing 58×38 food presets and user documents are unchanged.


## Variable die-cut label sizes (1.0.19)

For media using the transmissive gap sensor (integer gap **1–10 mm**), LabelDesk now sets the documented `ESC qNNN` to **label height + gap** in millimeters on app launch, when saving settings and when printing. The original 38+2 mm roll still sends `q040` and retains its original 280-line raster payload. For new heights (10–100 mm), raster rows follow `8 × (height − 3 mm)` with the original 3-mm bottom safety reserve; the native CP866 engine reserves 6 mm at the bottom as before. Saved templates are never resized. Continuous stock (gap 0) is blocked because it requires a different sensor/transport mode.

**Hardware verification:** Only 58×38 mm + 2 mm gap was physically tested. For a different roll, print **one label** first, verify start position, margins and FEED, then use batch printing. The isolated experimental ASCII native diagnostic remains limited to 38+2 mm. No extra feed, reverse movement or undocumented commands were added.

**1.0.13 WebKit/zsh release (data safety, consistent inputs, printable EZ-2 calibration atlas).** No Node.js, Python, pip, npm, HTTP server or external dependencies are needed on the user's Mac. The system frameworks AppKit/WebKit and system commands `/bin/zsh`, `/bin/stty`, `/bin/cat` and `printf` handle the application and RS-232.

## AI catalog fill (1.0.18)

The **AI-заполнение** dialog works within the existing item catalog. It discovers standard fields directly from the item form and offers already-used custom field names in the current folder. Folders are groupings, not product category dictionaries.

Select fields, copy a photo/text prompt, use ChatGPT separately, then paste the returned JSON. Invalid types and values fail atomically. Unknown or unselected fields trigger warnings, while null and omitted values preserve existing data. Imported changes affect only the unsaved form; original Save remains responsible for persistence. Selection is stored locally. No external AI API or printer commands were added.

## Runtime layout

After the initial macOS installation, the following files are copied into the user's existing LabelDesk application-support directory:

```text
~/Library/Application Support/LabelDesk/
├── live/
│   ├── app.html       # all screens
│   ├── app.js         # navigation, template library and queue
│   ├── editor.html    # separate CP866 line and raster geometry workspaces
│   ├── raster.js      # original ESC Gnn raster
│   ├── barcodes.js    # Code39/128/EAN generator
│   ├── native.js      # isolated one-label diagnostic
│   ├── text-engine.js # resident CP866 compiler
│   ├── food-presets.js# four seeded food-container samples
│   ├── dish-engine.js # optional item-to-template field mapping
│   ├── dish-controller.js # universal catalog and batch interface
│   ├── printer-text.sh# buffered text transport
│   ├── printer-native.sh # native diagnostic transport
│   └── printer.sh     # original raster driver
├── templates/          # existing UUID JSON templates, untouched
├── folders.json        # existing logical folders, untouched
├── items.json          # universal catalog (new writes in 1.0.7)
├── itemFolders.json     # catalog folders (new in 1.0.9)
├── dishes.json         # legacy catalog kept for safe fallback (1.0.6)
├── queue.json          # existing queue and job history, untouched
├── settings.json       # existing port and printer options, untouched
├── spool/              # temporary binary files (removed after job)
└── logs/
    └── shell-driver.log
```

The **compiled Swift app provides a WebKit window, a file/Process bridge and the existing signed GitHub updater** for reading/writing these local JSON files and invoking `printer.sh` via `/bin/zsh` with fixed arguments. All EZ-2 commands, bitmap rendering, queue policy and interface are outside Swift. Change a file in `live/`, then restart the application: **no Xcode, CI, DMG or rebuild is needed**.

On installation/update, bundled runtime files overwrite the local version **only when it is still identical to the previously installed unmodified version**. Hand edits in `live/` are intentionally preserved.

## Catalog and printing (1.0.7)

- **Каталог** is the landing screen. One saved **position** may be a product, a dish or arbitrary data. A position can contain standard fields (name, weight, energy, protein, fat, carbohydrates, ingredients, allergens, manufacturer, storage, shelf life) and any number of custom named key/value fields, up to 40 per position.
- **Template linking:** in **Редактор этикеток**, mark a text/barcode element as variable and set **Имя поля в карточке каталога** to exactly the name of a standard field (common Russian aliases supported) or a custom field. Values are copied to a temporary printable snapshot. **If the value is missing, blank, or the field is unknown, that whole variable element, including prefix, is omitted.** Fixed elements are preserved. Completely empty resolved labels cannot be printed.
- **Batch printing:** select multiple positions in the catalog, choose a template per row and set copies. Production date, optional shelf-life/expiry and batch code are entered for this batch; the item catalog is not overwritten. The entire batch is validated before a single atomic queue update. Unsupported media or printer encoding still blocks printing. Hardware print output is not guaranteed by a preview.
- **Storage:** new writes go to \`items.json\`. If it is absent, the app loads old \`dishes.json\` records as food-type positions. Only after the first save is \`items.json\` created; \`dishes.json\` is **not deleted or modified**. Existing UUID templates, folders, settings, and print queue files remain untouched.
- **Navigation:** the left vertical sidebar contains Catalog, Label Editor, Print Queue and Settings. The Catalog sidebar lists positions; the Editor sidebar lists saved template folders and layouts. Folder/template management actions are collapsed unless opened. The old one-off Quick Fill tab is no longer exposed; its internal compatibility code remains to avoid breaking previous data. Sidebar and layer-panel widths can still be adjusted independently.
- **Runtime constraints:** no app-time Node/Python/npm, no network storage, and no changes to the tested GoDEX EZ-2 text/CP866 or raster/serial transport. Verify first labels physically on the installed roll before production printing.

## Print batches, catalog folders, application icon (1.0.9)

The **Каталог** page is for maintaining saved items. Saved positions can be assigned to catalog folders with the **Папки каталога → ＋** control or the folder chips in the item card. Folders are stored separately in `itemFolders.json` and do not interfere with the label template folders in `folders.json`. Renaming does not change item IDs. Deleting a folder moves its items to **Без папки**, never deleting the positions; the application attempts a rollback if the category-file write fails.

**Печать позиций** is now a separate top-level page. Its search and folder filters are independent of catalog browsing. Select multiple items (including across folders), configure production date, expiration override, batch code, quantities, and per-item templates. **Дополнить** expands an individual row so that any standard field can be temporarily changed or missing custom fields can be added. The queued document uses a snapshot of these temporary edits; the original item and template files remain unchanged. **Подготовить печать →** validates and persists the batch atomically, then opens the existing **Очередь** page where the user explicitly starts the physical print. This avoids accidentally printing old pending jobs.

The Intel Mac installer now includes `LabelDesk.icns`, generated at build time from `Scripts/make-icon.swift` with all expected 16–1024 px iconset representations. `CFBundleIconFile` points to that icon for Finder/Dock. Printer command transport and print dimensions are unchanged.

## Fixed-height native text fields (1.0.17)

A resident-font text field in **Текст CP866** has a fixed width in millimeters and fixed **Высота поля, строк**. The row height depends on the selected printer font (A00: 10 dots = 1.25 mm, A11: 26 dots = 3.25 mm). New text fields allocate two rows by default (inverted text: one); users can set 1–20 rows per field.

- Wrapped text remains within the allocated width and row height. Fewer content lines reserve the rest as printable blank CP866 rows, so the **next field always starts at the same row** regardless of catalog values.
- Too much content generates a visible red boundary and error in the editor, while the printer encoder refuses to enqueue that label. Overflow is not silently cut off.
- Blank or missing catalog values reserve the fixed row slots without printing the placeholder or constant prefix; an entirely empty label is still rejected.
- Inverted fields reserve a native A00 separator after each row, including unused slots, keeping the following field stable.
- Existing templates without a `fixedRows` property retain their previous automatic line height. In the editor, **Зафиксировать текущую высоту поля** converts one field explicitly using its present wrapped line count. No forced migration occurs.
- The previously confirmed serial protocol, feed, sensor settings and barcodes are unchanged. Actual physical blank-row spacing should still be checked once on a single label; browser preview is approximate for firmware glyph bitmaps.

## Measured native text calibration and objects (1.0.15)

Physical G01/G02 test photographs on 58×38 mm media confirmed **A00 8×10 dots** = 1 mm character pitch × 1.25 mm row pitch, CP866 corner/tee/line glyph connection, and correct scaling of A02/A03/A04/A11/A21. The physical print-head starting position is approximately 2 mm from the left edge and 1 mm from the top edge. These offsets have been introduced **only in editor preview**, never into serial commands, ESC Mnn or label feeding. The firmware's individual glyph bitmaps remain approximate in the browser.

The **Текст CP866** editor has three practical native objects:

- **Таблица**: enter one row per line, split cells using `|`, and specify 2–4 column widths in characters (e.g. `7,22,8`). A complete single-line CP866 outline and column junctions are compiled with fixed A00 cells. Text inside cells wraps automatically; excessive rows/widths are rejected before printing. Only the header is separated by a horizontal rule by default.
- **Чёрная плашка**: a native text row with `ESC V` inversion, not raster. When more content follows a reversed row, a 10-dot blank A00 line is inserted so the next line doesn't touch the black fill, as observed in G02.
- **Линия CP866**: adjustable A00 length and single `─`, double `═` or full `█` symbol styles. No slower raster rectangles.

For native text, physical Y positioning still proceeds by consecutive CR lines and resident-font heights; freely dragging elements along Y is intentionally unsupported. Existing templates are read without migration. Print geometry remains bounded by the confirmed 256-dot native row budget.

## Editor sample print (1.0.14)

Open an existing or new label in **Редактор этикеток** and click **Пробная печать · 1 шт.** next to **Сохранить макет**.

- A current unsaved editor snapshot is validated with the ordinary production encoder.
- Literal `[НАЗВАНИЕ]`, `[МАССА]` and other bracketed text is printed exactly as written, without having to create a catalog item. This exception exists **only for the disposable test snapshot**; real catalog batch print still checks required values.
- The stored template is never overwritten. The print goes through the normal persisted queue, one copy, and only the newly added job ID can be transmitted.
- The printer's port and installed roll compatibility are checked first; the user must explicitly confirm before paper is fed.
- If CP866 cannot encode a symbol or if a raster block exceeds its geometry, printing is stopped with a visible error rather than silently changing the label.
- The feature does **not** change paper motion, native font bitmaps, or start-of-label calibration. Physical measurements are still needed to align the editor view exactly.

## Storage, calibration atlas and input consistency (1.0.13)

### Reliable local data

- All settings, items, folders, queue, saved parties and label templates stay under `~/Library/Application Support/LabelDesk/`. Existing JSON schemas and IDs remain unchanged.
- **No silent reset on damaged JSON**: loading a malformed file reports its exact filename. The UI must never replace unreadable data with empty arrays.
- Before each overwrite or template deletion, the native bridge copies the previous file into `Backups/History/<filename>/`, retaining 12 generations per file. Writes stay atomic. A full manual snapshot from Settings copies every saved JSON and template directory into `Backups/LabelDesk-<date>-<id>/`; even corrupted raw data can be included for recovery.
- **Runtime drift**: when an edited HTML/JS/script differs from the installed bundle, Settings identifies filenames and offers to restore the installed resources, after backing up the edited ones. The catalog and labels are not touched.

### Printable calibration atlas

Settings → **Тестовые этикетки EZ-2** lists individually selectable, labelled samples. Tests use existing CP866 and ESC G encoders, the same 58×38 mm stock and 2 mm label gap. **Each action prints only one selected specimen, with explicit confirmation**; the preexisting queue is not drained automatically.

Sample IDs:
- `R01`: 10-mm-spaced raster ruler lines, from x=2 mm; horizontal lines y=5/15/25/32 mm. Measure from the physical label edges, not from the cut bar.
- `R02`: rectangular borders 25×17 and 22×17 mm and raster lines 1/2/4 dots thick.
- `F01...`: the complete supported resident font matrix A00–A04 and A11–A48 (font code and documented glyph dimensions are printed before every sample). Large fonts are split across multiple labels; select only the pages needed.
- `C01`, `C02`, `C03`: ASCII printable range, Cyrillic CP866 and supported frame/filled glyph mapping, respectively. Byte ranges are printed for comparison.
- `N01`: ESC V inverse/regular text, followed by a normal row to verify that CR ends inverse printing.
- `B01...B04`: native Code128/Code39/EAN13/EAN8 and their human-readable checksums.
- `R03`, `R04`, `R05...R08`: 6/8/10/12/16 pt raster typography, Unicode specials and comparable raster barcodes.

**Suggested first physical session:** print only `R01`, `F01`, `C02` and `R02` (four labels, one at a time). Photograph each square-on with a ruler along the label's horizontal and vertical edges, and note left/top print offsets, 10-mm spacing, native font heights and frame dimensions. Afterwards adjust the display mapping from measurements, not an assumed printer response. CP866 glyph bitmaps in firmware cannot be inferred exactly from the manual alone. Do not change feed commands or paper sensor settings based only on a visual guess.

### Workflows

- Numeric fields in Settings, Catalog, batch details and editor properties share a common plus/minus stepper. Native multi-choice dropdowns for catalog type and port selection were replaced by segmented buttons and searchable ports. Date/time inputs remain native OS controls.
- Search/filter available label templates from Print instead of rendering every template button. Batch preflight validates each selected snapshot and reports concrete errors in the corresponding row.
- Saved print parties can repair deleted catalog item/template references. Confirmed `Печатать…` sends only jobs from that party, without touching older queued work. Dates are refreshed on recall.
- Editor: choose a known catalog variable from chips, and optionally preview the same unsaved template using saved catalog data without overwriting the template.

## Compact batch preparation and framed text (1.0.12)

The **Печать позиций** picker now shows only **six unselected catalog positions** as compact full-width rows, never a second oversized catalog. Search and folder filtering still work; **Показать ещё** reveals the next six; **Добавить показанные** adds only the visible unselected rows. Already selected positions remain in the separate party table.

Use **Сохранить текущую партию** to create a named preset stored in `printPresets.json` (independent of `items.json`, `folders.json`, `queue.json`). A preset stores live catalog item IDs, layout IDs, quantities, batch code and one-time custom overrides. It does not freeze the production and expiration dates: on reopening they reset to now and blank respectively, allowing shelf-life calculations to remain current. **Открыть** lets you edit before printing. **В очередь** prepares a snapshot from the current catalog and does **not** send it directly to the serial port — physical printing is still started separately in the existing queue screen. Invalid preset references abort the entire operation.

Two clearly distinct **framed text objects** are available in the corresponding editors:
- **Text CP866:** a single editable block with multi-line content, line wrap, left/center/right alignment, selectable resident font A00–A22, single or double box-drawing borders, a 0=auto interior row setting or a fixed value up to 24. The buffered text planner validates content fitting, total label height and width before creating a packet; there is no arbitrary native XY drawing command. The on-screen CP866 box-drawing glyphs are approximated as explicit vector strokes, eliminating the previously distorted black bars.
- **Raster:** a rectangular object with content drawn inside the border using the same 8 dots/mm raster engine as other objects. Adjustable line thickness, internal padding, multi-line content, point size, boldness and alignment; the object can be moved/resized via the canvas. The raster renderer clips text to its inner rectangle, without changing the existing ESC G protocol.
- Both framed-text kinds support mapping a saved catalog field directly into the frame, with blank fields omitted at batch build time. Existing rectangle and text blocks remain available.

Other documented EZ-2 features: an optional **ESC V reverse-text** setting (white letters on a dark line) in native text mode; Code 128/39, EAN-8/13 and built-in font scaling retain their established control paths. Native zoom/format/rotation dropdowns in the label editor have been replaced with explicit controls. A one-label physical check remains necessary for the newly exposed ESC V option and framed text.

## List and print workflow cleanup (1.0.11)

- **Каталог:** navigation sidebar lists **only catalog folders**. The main screen lists saved positions with **Редактировать / ＋ В печать / Удалить**, and the full position form opens on demand. Saving a position no longer silently includes it in the next print batch.
- **Этикетки:** navigation sidebar lists **only template folders**. Saved labels appear in the main screen with direct **Редактировать / Копировать / Переместить / Удалить** controls. The editor canvas opens on explicit Edit or New, and **← Все этикетки** returns to the list. Folder filters stay independent from catalog folders. Existing label IDs, JSON structure and printer mode are unchanged.
- **Печать позиций:** starts with an empty selected list. The top picker uses search and folder filters with explicit **＋ Добавить** (or **Добавить найденные**); the lower batch table displays **only added positions**, and **Убрать** removes an item from the batch without deleting the saved catalog record. Search/filter changes never silently change batch contents. The per-item template, copy count and transient data override UI are preserved.
- **Margin persistence bug fixed:** formerly the `saveSettings` function referenced undefined `left`/`right`; validation had accidentally been inserted into an obsolete native test. The save operation now validates 0–15 whole millimeters, stores both values under `settings.profile.marginLeftMM` and `marginRightMM`, and restores them when Settings is displayed or the app is relaunched. Tests verify the save and refresh round-trip. No physical printer calibration commands were changed.
- **Text canvas 3-mm stripe:** the striped region at the right of a 58-mm label showed the distinct 55-mm ESC G raster limit, **not** a margin chosen in Settings. To avoid confusion it is no longer drawn over the text-mode canvas. The raster restriction and text planner bounds remain unchanged; the inspector explains the distinction. Blank new text templates now show a neutral create-a-line hint rather than a print-validation error.

## Label editor redesign (1.0.10)

- **Settings of each label (⚙ Макет)** now show two explicit modes: **Текст CP866** or **Растр**. No old saved template is automatically converted. A requested switch with incompatible elements is rejected rather than dropping objects. Legacy templates without a printMode flag remain raster.
- **Text mode** has a dedicated toolbar for lines, separators, native barcodes, and CP866 frame blocks. Rows are displayed top-to-bottom as the real buffered ESC text layout prints them; arrow buttons reorder exactly this sequence. No fictitious free X/Y controls. The embedded font gallery uses the original EZ-2/4 manual: A00 8×10, A01 bold 8×10, A02 bold 8×20, A03 bold 8×30, A04 bold 16×20; A11…A48 use 16×26 scaled horizontally (1–4) and vertically (1–8). Old A01/A04 metrics are corrected. The preview uses the real native line planner for character-cell widths, wrapping and margins; **macOS glyph outlines are approximations**, not screenshots of the printer firmware.
- **Text-frame element:** one editable object stores kind=textFrame, value, frameChars, frameRows and frameStyle (single/double). The buffered text compiler expands it into native CP866 top/bottom edges and vertical-sided content rows using A00. There is no raster command or arbitrary X/Y positioning for this element. Width, height and CP866 characters are validated before print.
- **Raster mode** retains existing drag/resize, exact X/Y controls and the established ESC G driver. Its rectangles, lines, text and barcode objects are unchanged. Incompatible text frames must be removed before switching to raster, rather than being silently converted.
- The visual font layout and text frame output require a **one-label physical test**. Automated checks cover font geometry and emitted CP866 bytes, but not physical positioning or glyph shape.

## Simple template library (1.0.8)

- A folder is now **only a grouping of label templates**. Creating a folder saves the name, but does not clone the current label or create a hidden mandatory base template.
- In the editor sidebar, folder rows have direct **rename (✎)** and **delete (×)** actions. Deleting a folder **moves all its templates to Без папки** (does not delete labels). Any saved label, including a previous base, can be selected, changed, duplicated, moved, or deleted.
- Selecting a folder displays its labels and opens the first in the editor. **＋ Новый шаблон** creates a draft assigned to the folder, saved only via **Сохранить макет**. Actions and destination folders are visible without nested inspector panels.
- In the catalog batch table, quantity uses a wide **− / count / +** control, and templates are selected from clickable tiles. Default template tiles apply to positions without an individual override.
- **Настройки → Отступы текстовой печати:** left/right margins are stored in the printer profile (0–15 whole millimeters each, sum below 50). They reserve space within the confirmed 55-mm printable width, control actual buffered CP866 Mnn horizontal margins and wrapping, and are visualized as neutral hatching in the editor. Click **⚙ Макет** or the empty canvas to open label-level properties and the settings shortcut. **Raster printing retains explicit coordinates**; these text margins do not move raster artwork.
- Existing folders, prior baseTemplateID metadata, templates, items, queue, settings and working files are preserved. The former base field is ignored, never used as a deletion/move restriction. Physically verify left/right positioning with one label before batch printing.

## Installed roll and template compatibility (1.0.2)

Under Settings → **Installed roll**, set the **width, height and gap** actually loaded in the printer. Default is **58 × 38 mm, 2 mm gap**. Existing `settings.json` files without these fields use those defaults; other settings keys are retained.

New labels use the stored media dimensions. Saved template JSON files are **never resized, converted, deleted or modified** when the roll changes. A template is currently considered compatible when its width, height and gap all **match exactly** (within 0.001 mm) the installed roll. Nonmatching templates show an explicit incompatible mark in the library, editor, quick-fill view and print queue; they remain editable and previewable. Incompatible queued jobs remain pending and are skipped by print actions.

**Two distinct boundaries:** Red editor hatching indicates a template region outside the configured physical roll. Gray hatching marks the separate, currently verified 55-mm `ESC G55` graphics limit — it is not the edge of the roll.

**Safety:** 38-mm label height plus 2-mm gap remains the physically verified reference (`ESC q040`, 280 raster rows). Since 1.0.19, the documented `ESC qNNN` and raster geometry follow the selected die-cut roll, with a confirmation before printing an unverified size. Continuous media without gaps remains blocked; print width is still limited to 55 mm.

## CP866 text printing and food-container starter labels (1.0.5)

**Physical tests on the user's actual EZ-2 established:**
CP866 Russian uppercase/lowercase and Ё/ё in resident fonts A11/A12/A21/A0n,
multiple lines separated by CR, M01/M10/M20/M30 horizontal margins, V/v
inverse text, CP866 line-drawing characters, and firmware Code39, Code128
and EAN13 barcode output. These tests used the verified 58×38 mm / 2 mm
gap roll and separate one-label buffered P01 jobs.
Barcode scanner readability, multi-copy Pnn/pnnn and compound text+barcode
labels are **not yet physically verified**; use a small test job first.

**Newly created documents use `printMode:"text"`:** the printer's sequential
buffered line mode with built-in CP866 fonts (A00…A04, A11…A48), Mnn left
margins and auto-wrapped text. Text and barcode blocks are printed top-to-bottom
in the stored element order (top-to-bottom in the text editor); **there is no arbitrary Y coordinate** in this protocol.
The editor displays an approximate layout, prevents dragging/resizing text
lines, and permits the two explicit modes in ⚙ Макет. Switch to raster if precise
XY placement, rectangles, images or unsupported characters are required.
Existing templates without a `printMode` keep using the original working
`printer.sh` Gnn raster driver without conversion or mutation.

**One buffered command per text job**: `ESC F0 q040 M01`,
optional `?n/X2` barcode selector, `ESC B`, CP866 rows terminated by CR,
`ESC E`, and `ESC P01…P99` (1–99 copies) or `ESC p100…p200 CR LF`
(100–200 copies). The exact syntax for Pnn/pnnn follows the original
2002 manual. The new `printer-text.sh` streams this packet at 9600 8N1,
without a startup T3, extra FF or a blank separator. The native mode and
raster mode are explicitly separated in the Swift bridge; malformed packets
and unsafe label layouts are rejected before opening the port.
The established `printer.sh` is unchanged.

**Food samples are added once, non-destructively** as four independent folders
with editable base templates, each 58×38 mm + 2 mm gap:

1. **Еда · Состав** — dish name, ingredients, allergens, net weight,
   preparation time, use-by time, storage temperature, batch,
   manufacturer and address.
2. **Еда · КБЖУ** — product, nutrition per 100 g (energy, proteins,
   fats, carbohydrates), weight, ingredients, allergens, dates and maker.
3. **Еда · Фасовка** — fast packing sticker with weight, preparation/use-by
   dates, storage, batch, ingredients and allergens.
4. **Еда · Партия и ШК** — dates, net weight, lot, manufacturer and
   firmware Code128 at the bottom.

The one-time import stores regular UUID template files and `folders.json`
references; it records `foodPresetsPack:"food-v1"` in existing settings.
Reopening or updating never replaces modified user templates or recreates
deleted samples. Existing folders, templates, settings and queued jobs
are left untouched. Bracketed fields such as `[ИНГРЕДИЕНТЫ]` are deliberately
**not printable until filled**, so examples cannot accidentally be used
as real food labels. Replace these with actual recipe, validated nutrition,
shelf-life, temperature and legal manufacturer data. These examples are not
a legal-compliance certification; requirements depend on the jurisdiction
and product.

## Original EZ-2 built-in text and barcode features (1.0.4)

Reference: the original *EZ-2/4 Manual*, April 2002, P/N 920-010210-00,
[format-command table](https://www.manualslib.com/manual/302891/Godex-Ez-2.html?page=13),
[barcode selectors](https://www.manualslib.com/manual/302891/Godex-Ez-2.html?page=14),
[font sizes and graphics](https://www.manualslib.com/manual/302891/Godex-Ez-2.html?page=18)
and [printer character set](https://www.manualslib.com/manual/302891/Godex-Ez-2.html?page=22).
**Do not use later EZPL `^L` / `At,x,y` commands on this 2002 EZ-2 model.**

The 2002 EZ-2 uses *sequential Line Mode* rather than absolute object XY commands.
Documented resident commands are `ESC Ahv` (16×26-dot ASCII expanded horizontally 1–4,
vertically 1–8), `ESC A0n` (8×10-dot text variants),
`ESC ?n` (barcode selector),
`ESC {DATA}` / `ESC |DATA}` (barcode with/without human-readable text),
`ESC Mnn` (left margin), and `ESC Gnn` (graphics). The original manual explicitly lists
Code128 B/C, Interleaved 2 of 5, Code39, Code93 and Codabar. Modern EZPL `L`, `R`, `A` arbitrary-coordinate drawing commands are **not documented for this hardware**.
The printer's 8-bit font also supports **CP866 Russian Cyrillic** including Ё/ё,
confirmed on the user's actual printer in physical testing. This does not imply
UTF-8 support: bytes must be converted to CP866 before sending.

The HTML editor now creates new text, barcode, and line blocks across the **verified
printable width** (55 mm on a 58-mm roll, not beyond the tested graphics head), keeping
old templates untouched. Each block retains explicit alignment and size controls.
Barcode types in the editor are:
- **Code128**: encoder B for mixed printable ASCII, encoder C for even-length numeric text, weighted Mod-103 checksum
- **Code39**: uppercase letters, digits and defined punctuation
- **EAN-13 / EAN-8**: calculate missing check digit or reject invalid supplied check digit

The same `barcodes.js` implementation renders editor preview and print bitmap. Narrow
modules must be at least **2 dots** and enough quiet zone must fit within the barcode
block: invalid or overly dense symbols are rejected rather than printed unreadably.
Barcodes can be variable fields and thus filled per job or as a batch without changing
the saved template.

**Native protocol remains an explicitly isolated experimental one-label trial.** A single
ASCII text block with `renderMode=device` / selected `A11`..font, or a single Code39
barcode block, can be sent with the **Test built-in printing: 1 label** control.
A compiled native packet uses the documented `F0/q040/M01` setup and buffered `B`...
`E/P01` sequence. The trial uses a separate local `printer-native.sh`, does **not**
send a startup T3, does **not** add a blank raster separator, and cannot send a batch.
Any other template still uses the original verified 280-row raster queue. The direct-native
layout and paper position have **not** been physically verified. **Do not automatically
switch production print jobs to native output until the one-label hardware test is inspected.**

## Printing protocol

- Physical device confirmed by its case label: **GoDEX EZ-2S**, firmware **LN3.400**; USB–RS232 **9600 8N1**, hardware/software flow control disabled in the current driver.
- Tested roll: **58 × 38 mm, 2 mm gap**, 40 mm pitch.
- **On application launch**, if a port is configured, the bridge runs `printer.sh --init PORT` and sends only `ESC q040`. This does **not** print or advance the stock. Saving printer settings sends the command again. The printer loses this state after power-off, so restart LabelDesk or save settings after powering the printer back on.
- Actual raster print: `ESC F0`, `ESC q040`, `ESC M01`, then binary `ESC Gnn` rows and `FF`. The protocol header remains; it does not print a separate label.
- The raster encoder uses 8 dots/mm, a maximum of 55 bytes (440 dots) per row and 280 rows for the tested mechanical page. It trims unused bytes on the right but not the page height.
- Copies share one open RS-232 port, with the configured interval (default **1.5 seconds**).
- **No** startup `T3`, automatic blank separator, reverse feed, or extra `FF` is sent by the queue. Only requested labels are transmitted. Text-mode buffered packets retain their own native header and print count.
- Physically verified standalone positioning commands: `ESC q040` makes the FEED button advance to the next label; `ESC f05` moves forward 5 mm; `FF` then finds the next label. These are **not** inserted automatically into the print queue. `ESC R10` caused motor noise without reverse paper movement and must not be used.

Previous attempts to add a buffered blank separator after raster printing failed on the physical printer; the later unverified 280-row blank raster separator has now been removed. RS-232 output has no reliable printer completion acknowledgement. Failed or interrupted transmission remains `uncertain` and requires inspecting the label before retrying.

## Existing files and migration

Templates use the same `LabelDocument` structure: `id`, `folderID`, `name`, `widthMM`, `heightMM`, `gapMM`, `elements`, `updatedAt`. Old `LabelElement` fields and folder base-template IDs are retained. Quick fill changes only `isVariable` text values in each queued snapshot.

Saved jobs use the old `PrintJob` JSON shape. `sending` jobs are considered `uncertain` on relaunch. Existing settings preserve the selected port and raster threshold; unused Q/pacing options are ignored.

The current JS renderer handles text, alignment, line, rectangle, rotation and Code 39. Its bitmap output may differ slightly from the former Swift/CoreGraphics raster because system browser font metrics differ. Compare the on-screen print preview before sending a job.

## Building and local testing

```sh
zsh Scripts/build-installer.sh
```

GitHub Actions compiles an Intel x86_64 app and DMG and runs syntax and compatibility tests. Printing one copy and three copies within one job was physically confirmed on test 1.0.0. Two distinct queued jobs and the inter-job separator remain to be physically verified. Test short batches before production.

The new native toolbar contains **Check for updates** / **Install update** using the existing SHA-256 and Intel signed-package verification plus rollback helper. From v1.0.2, the built-in updater can install 1.0.3. The temporary v1.0.0 test build did not include an updater, so users running it need to replace the app once using the 1.0.1 installer; subsequent updates work in-app. The app includes a button under Settings → *Open working files* to edit the files directly. The driver can also be inspected using a standard editor. No background daemon, open HTTP port or Node/Python runtime is involved.
