# LabelDesk — original GoDEX EZ-2 on macOS (WebKit + zsh)

**1.0.1 WebKit/zsh rewrite.** No Node.js, Python, pip, npm, HTTP server or external dependencies are needed on the user's Mac. The system frameworks AppKit/WebKit and system commands `/bin/zsh`, `/bin/stty`, `/bin/cat` and `printf` handle the application and RS-232.

## Runtime layout

After the initial macOS installation, the following files are copied into the user's existing LabelDesk application-support directory:

```text
~/Library/Application Support/LabelDesk/
├── live/
│   ├── app.html       # all screens
│   ├── app.js         # library, quick fill, saved queue
│   ├── editor.html    # original editor, same layer/geometry UI
│   ├── raster.js      # canvas renderer and ESC Gnn encoder
│   └── printer.sh     # editable macOS RS-232 driver
├── templates/          # existing UUID JSON templates, untouched
├── folders.json        # existing logical folders, untouched
├── queue.json          # existing queue and job history, untouched
├── settings.json       # existing port and printer options, untouched
├── spool/              # temporary binary files (removed after job)
└── logs/
    └── shell-driver.log
```

The **compiled Swift app provides a WebKit window, a file/Process bridge and the existing signed GitHub updater** for reading/writing these local JSON files and invoking `printer.sh` via `/bin/zsh` with fixed arguments. All EZ-2 commands, bitmap rendering, queue policy and interface are outside Swift. Change a file in `live/`, then restart the application: **no Xcode, CI, DMG or rebuild is needed**.

On installation/update, bundled runtime files overwrite the local version **only when it is still identical to the previously installed unmodified version**. Hand edits in `live/` are intentionally preserved.

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

The new native toolbar contains **Check for updates** / **Install update** using the existing SHA-256 and Intel signed-package verification plus rollback helper. From v0.9.5, the built-in updater can install 1.0.1. The temporary v1.0.0 test build did not include an updater, so users running it need to replace the app once using the 1.0.1 installer; subsequent updates work in-app. The app includes a button under Settings → *Open working files* to edit the files directly. The driver can also be inspected using a standard editor. No background daemon, open HTTP port or Node/Python runtime is involved.
