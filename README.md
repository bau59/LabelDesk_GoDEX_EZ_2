# LabelDesk — original GoDEX EZ-2 on macOS (WebKit + zsh)

**1.0.2 WebKit/zsh release.** No Node.js, Python, pip, npm, HTTP server or external dependencies are needed on the user's Mac. The system frameworks AppKit/WebKit and system commands `/bin/zsh`, `/bin/stty`, `/bin/cat` and `printf` handle the application and RS-232.

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

## Sidebar and template workflow (1.0.3)

The library is now a real folder/template manager, not a flat shortcut list. Open a folder to display its assigned base template in **Quick Fill**, or choose any saved template to open it in the editor. Change the folder's base with the **☆** control next to a template in that folder, or with the explicit dropdown in the folder inspector. The blue/gray selection distinguishes the currently edited template from the folder's persistent base; a gold star denotes the base.

Create a folder → the current editor label is **cloned into a new independent base JSON**; the original is not moved or overwritten. New templates created while inside a folder belong to it. Save them and assign them as the base using ☆. A template can be duplicated, moved between folders, or moved to *Unfiled*. Moving/deleting an active base is blocked until another base is selected. Rename folders freely. Removing a folder **moves all its templates into Unfiled** without deleting template files, and attempts to roll back on a partial write failure.

Search matches templates **globally** across folders. With an empty search, the selected folder filters the list. Draft changes prompt before switching folders/templates; the editor shows the current folder/template and unsaved state. Quick-fill only changes variable text in a queued snapshot and never overwrites the saved base. Existing media incompatibility markers are retained.

The interface has a wider hierarchical sidebar, direct template actions, clearer navigation and adjusted editor panel widths. Printer transport (`printer.sh`), EZ-2 serial commands, existing JSON storage paths, queue transmission and secure native updater are **unchanged**.

CI exercises the actual UI controller using a fake WebKit/JSON bridge: folder creation, independent base clone, assignment by dropdown and star, duplication/move, rename/delete with file preservation, global search, draft protection, quick-fill, queue, printing invocation and failed-write rollback. Browser appearance still needs inspection in the actual application window; the connected Mac is currently offline.

## Installed roll and template compatibility (1.0.2)

Under Settings → **Installed roll**, set the **width, height and gap** actually loaded in the printer. Default is **58 × 38 mm, 2 mm gap**. Existing `settings.json` files without these fields use those defaults; other settings keys are retained.

New labels use the stored media dimensions. Saved template JSON files are **never resized, converted, deleted or modified** when the roll changes. A template is currently considered compatible when its width, height and gap all **match exactly** (within 0.001 mm) the installed roll. Nonmatching templates show an explicit incompatible mark in the library, editor, quick-fill view and print queue; they remain editable and previewable. Incompatible queued jobs remain pending and are skipped by print actions.

**Two distinct boundaries:** Red editor hatching indicates a template region outside the configured physical roll. Gray hatching marks the separate, currently verified 55-mm `ESC G55` graphics limit — it is not the edge of the roll.

**Safety:** The current printing transport is still verified only for **38-mm label height plus 2-mm gap** (`ESC q040`, 280 raster rows). Settings for other media sizes can be saved and used to prepare templates, but sending them to the printer is blocked until a matching transport protocol has been physically verified. Changing settings does not silently change motor commands. Width changes within the supported template bounds do not alter the fixed motor pitch.

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
