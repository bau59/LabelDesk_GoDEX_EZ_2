# LabelDesk — original GoDEX EZ-2 on macOS (WebKit + zsh)

**1.0.7 WebKit/zsh release (universal catalog, custom fields, clean navigation).** No Node.js, Python, pip, npm, HTTP server or external dependencies are needed on the user's Mac. The system frameworks AppKit/WebKit and system commands `/bin/zsh`, `/bin/stty`, `/bin/cat` and `printf` handle the application and RS-232.

## Runtime layout

After the initial macOS installation, the following files are copied into the user's existing LabelDesk application-support directory:

```text
~/Library/Application Support/LabelDesk/
├── live/
│   ├── app.html       # all screens
│   ├── app.js         # navigation, template library and queue
│   ├── editor.html    # original editor, same layer/geometry UI
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

## Existing template folder compatibility

Templates remain separate UUID JSON files; folder membership and optional base template are stored in \`folders.json\`. Selecting a folder opens the base layout in the **label editor**, not the former quick-fill form. The current implementation creates a new folder by cloning the current layout as its independent base template; the original is never moved. Saved layouts may be duplicated, moved, or reassigned to a folder. A base template cannot be moved/deleted until another base is assigned. Deleting a folder moves its templates to *Без папки* without deleting the files.

Search filters templates globally; with an empty query the selected folder controls the list. Existing unsaved-change guards and media incompatibility warnings remain. The physical roll and label geometry are independent of resizing/collapsing the UI panels.

## Installed roll and template compatibility (1.0.2)

Under Settings → **Installed roll**, set the **width, height and gap** actually loaded in the printer. Default is **58 × 38 mm, 2 mm gap**. Existing `settings.json` files without these fields use those defaults; other settings keys are retained.

New labels use the stored media dimensions. Saved template JSON files are **never resized, converted, deleted or modified** when the roll changes. A template is currently considered compatible when its width, height and gap all **match exactly** (within 0.001 mm) the installed roll. Nonmatching templates show an explicit incompatible mark in the library, editor, quick-fill view and print queue; they remain editable and previewable. Incompatible queued jobs remain pending and are skipped by print actions.

**Two distinct boundaries:** Red editor hatching indicates a template region outside the configured physical roll. Gray hatching marks the separate, currently verified 55-mm `ESC G55` graphics limit — it is not the edge of the roll.

**Safety:** The current printing transport is still verified only for **38-mm label height plus 2-mm gap** (`ESC q040`, 280 raster rows). Settings for other media sizes can be saved and used to prepare templates, but sending them to the printer is blocked until a matching transport protocol has been physically verified. Changing settings does not silently change motor commands. Width changes within the supported template bounds do not alter the fixed motor pitch.

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
in the stored element order (bottom-to-top in the editor's reversed layer
panel); **there is no arbitrary Y coordinate** in this protocol.
The editor displays an approximate layout, prevents dragging/resizing text
lines, and permits a mode switch in its toolbar. Switch to raster if precise
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

- Original GoDEX EZ-2, USB–RS232, **9600 8N1**, flow control disabled.
- Physically tested label stock: **58 × 38 mm, 2 mm gap**, one pitch 40 mm.
- Start of batch: a buffered `T3` alignment job once.
- Actual label: `ESC F0`, `ESC q040`, `ESC M01`, then binary `ESC Gnn` rows and `FF`.
- Canvas raster uses 8 dots/mm, maximum width 55 bytes (440 dots) and **always 280 rows** for the verified mechanical page length (35 mm). It trims unused bytes on the right for shorter text but never shortens the page height.
- Copies share one open RS-232 port. Each label waits the configured interval (default **1.5 seconds**).
- After **each job, not each copy**: remain in Line Mode and send 280 blank `ESC G10` rows followed by `FF` to expose a blank label for tearing. This replaces the 0.9.5 procedure that mixed modes and failed on the real printer. The new same-mode separator is **not yet physically verified**.
- `ESC f29/f11`, buffered `P01` after raster, automatic reverse, Q calibration and silent retry have been removed.

Earlier Python tests confirmed G55 × 280 full-page raster printing and a standalone buffered blank label. The 0.9.5 attempt to use the blank buffered command after Line Mode **failed**. The rewrite therefore uses a fixed full-page Line Mode raster for both printed and blank separator labels. **This combined sequence still needs on-printer validation.** The adapter does not provide an acknowledgement of actual paper output. On a command failure or cancellation, the queued job becomes `uncertain`; it must only be retried after the operator inspects the paper.

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
