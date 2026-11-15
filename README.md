# LabelDesk — original GoDEX EZ-2 on macOS (WebKit + zsh)

**Experimental 1.0.0 rewrite.** No Node.js, Python, pip, npm, HTTP server or external dependencies are needed on the user's Mac. The system frameworks AppKit/WebKit and system commands `/bin/zsh`, `/bin/stty`, `/bin/cat` and `printf` handle the application and RS-232.

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

The **compiled Swift app is only a WebKit window and a bridge** for reading/writing these local JSON files and invoking `printer.sh` via `/bin/zsh` with fixed arguments. All EZ-2 commands, bitmap rendering, queue policy and interface are outside Swift. Change a file in `live/`, then restart the application: **no Xcode, CI, DMG or rebuild is needed**.

On installation/update, bundled runtime files overwrite the local version **only when it is still identical to the previously installed unmodified version**. Hand edits in `live/` are intentionally preserved.

## Printing protocol

- Original GoDEX EZ-2, USB–RS232, **9600 8N1**, flow control disabled.
- Physically tested label stock: **58 × 38 mm, 2 mm gap**, one pitch 40 mm.
- Start of batch: a buffered `T3` alignment job once.
- Actual label: `ESC F0`, `ESC q040`, `ESC M01`, then binary `ESC Gnn` rows and `FF`.
- Canvas raster uses 8 dots/mm, maximum width 55 bytes (440 dots), 280 verified rows (35 mm). It trims unused right-side bytes and trailing white rows for short text.
- Copies share one open RS-232 port. Each label waits the configured interval (default **1.5 seconds**).
- After **each job, not each copy**: close Line Mode, open a separate connection and send the **physically verified buffered blank label** (`F0 q040 M01 B A11 SPACE CR E P01`). This is intended to expose a blank label for tearing, and to position the next job.
- `ESC f29/f11`, automatic reverse, Q calibration and silent retry have been removed.

The stand-alone blank label and earlier raster tests were physically verified separately. **The combined application printing sequence still needs on-printer validation.** The adapter does not provide an acknowledgement of actual paper output. On a command failure or cancellation, the queued job becomes `uncertain`; it must only be retried after the operator inspects the paper.

## Existing files and migration

Templates use the same `LabelDocument` structure: `id`, `folderID`, `name`, `widthMM`, `heightMM`, `gapMM`, `elements`, `updatedAt`. Old `LabelElement` fields and folder base-template IDs are retained. Quick fill changes only `isVariable` text values in each queued snapshot.

Saved jobs use the old `PrintJob` JSON shape. `sending` jobs are considered `uncertain` on relaunch. Existing settings preserve the selected port and raster threshold; unused Q/pacing options are ignored.

The current JS renderer handles text, alignment, line, rectangle, rotation and Code 39. Its bitmap output may differ slightly from the former Swift/CoreGraphics raster because system browser font metrics differ. Compare the on-screen print preview before sending a job.

## Building and local testing

```sh
zsh Scripts/build-installer.sh
```

GitHub Actions compiles an Intel x86_64 app and DMG and runs syntax and compatibility tests. **Do not publish 1.0.0 as the default stable release until the combined workflow is physically tested on the user's printer.**

The app includes a button under Settings → *Open working files* to edit the files directly. The driver can also be inspected using a standard editor. No background daemon, open HTTP port or Node/Python runtime is involved.
