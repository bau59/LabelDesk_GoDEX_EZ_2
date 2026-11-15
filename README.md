# LabelDesk

Native macOS application for preparing and sending label jobs to a GoDEX EZ-2 over a USB–RS232 adapter. It uses SwiftUI, Foundation and POSIX only; it does not use a printer driver, browser, server or external dependencies.

## Current build: Phase 1 with update checking

- detection and selection of `/dev/cu.*` serial devices;
- saved port selection;
- exclusive 9600 8N1 serial writes outside the UI thread;
- a user-confirmed `TEST` print using the exact command sequence already verified with the printer;
- automatic daily check for versioned GitHub Releases, a manual **Check for Updates** button, SHA-256 verification when GitHub supplies an asset digest, and DMG download/opening after approval.

The physical printer protocol has deliberately not been extended beyond the documented and already verified text test. The editor, print queue, raster (`ESC G`) output and calibration remain as future source-code scaffolding, but are not compiled into this phase. Validate raster bit order, line framing and media motion with hardware before enabling them.

## Download an Intel macOS build

Open [GitHub Releases](https://github.com/bau59/LabelDesk_GoDEX_EZ_2/releases/latest) to download the latest versioned Intel DMG. The [Build Intel macOS workflow](https://github.com/bau59/LabelDesk_GoDEX_EZ_2/actions/workflows/build-intel.yml) also keeps a downloadable artifact for each successful run. The workflow runs on `macos-15-intel`.

When a successful push to `main` contains a *new* `CFBundleShortVersionString`, the workflow automatically publishes that version in GitHub Releases; pushes without a version bump do not alter a published release.

The app checks for updates at most once a day and has a **Check for Updates** button. A newer release is downloaded only after user confirmation, its SHA-256 is checked when GitHub provides an asset digest, and the DMG is opened. **Drag LabelDesk.app into Applications to finish installing.** There is no background replacement of running app files, and no updater in the previously installed v0.1.0, so v0.2.0 must be installed manually once.

The build is ad-hoc signed, not Apple Developer ID notarized. macOS Gatekeeper may show a warning for files downloaded from GitHub; use Control-click → Open if you trust this build. Only the Phase 1 TEST-print app and update checker are compiled into these packages.

## Build locally

The macOS SDK and Swift compiler are required. From the repository root, run:

```sh
zsh Scripts/build-installer.sh
```

The script is invoked with `zsh` because its Git file mode is not executable.

The script creates `build/LabelDesk.app` and `build/LabelDesk-<version>.dmg`. The app is ad-hoc signed for local installation; macOS may require opening it with Control-click → Open on first launch. It targets Intel (`x86_64`) Macs running macOS 15 or later.

If a build fails, repeat it in diagnostic mode:

```sh
LABELDESK_DEBUG=1 zsh Scripts/build-installer.sh
```

The script compiles only the Phase 1 app and keeps the system-module cache in `.build/module-cache`, making repeat builds faster.

## Hardware check

1. Connect and power on the USB–RS232 adapter and printer.
2. Open **Printer settings**, choose the detected `/dev/cu.*` device, and save.
3. Return to the main screen and use **Print TEST**. Confirm the dialog only when paper is loaded.
4. The UI says **Sent to serial port**, not "printed", because EZ-2 does not provide a reliable completion acknowledgement here.

No print is sent at launch, on save, or during a build.

## Project layout

`LabelDesk.xcodeproj` is available for editing in Xcode, but the installer script compiles the Swift sources directly. Application data is saved under `~/Library/Application Support/LabelDesk`.
