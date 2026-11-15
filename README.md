# LabelDesk

Native macOS application for preparing and sending label jobs to a GoDEX EZ-2 over a USB–RS232 adapter. It uses SwiftUI, Foundation and POSIX only; it does not use a printer driver, browser, server or external dependencies.

## Current build: Phase 1

- detection and selection of `/dev/cu.*` serial devices;
- saved port selection;
- exclusive 9600 8N1 serial writes outside the UI thread;
- a user-confirmed `TEST` print using the exact command sequence already verified with the printer.

The physical printer protocol has deliberately not been extended beyond the documented and already verified text test. The editor, print queue, raster (`ESC G`) output and calibration remain as future source-code scaffolding, but are not compiled into this phase. Validate raster bit order, line framing and media motion with hardware before enabling them.

## Build an installable app

The included macOS Command Line Tools are enough; full Xcode is not required. Run:

```sh
./Scripts/build-installer.sh
```

The script creates `build/LabelDesk.app` and `build/LabelDesk-0.1.0.dmg`. The app is ad-hoc signed for local installation; macOS may require opening it with Control-click → Open on first launch. It targets Intel (`x86_64`) Macs running macOS 15 or later.

If a build fails, repeat it in diagnostic mode:

```sh
LABELDESK_DEBUG=1 ./Scripts/build-installer.sh
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
