# LabelDesk — GoDEX EZ-2 (Intel macOS)

Native SwiftUI label designer and queue for the original 2002 GoDEX EZ-2. macOS 15+, Intel x86_64. Local templates, quick fill, serial transmission and application updates.

## Physical configuration tested on 15 November 2026

- GoDEX EZ-2, Prolific PL2303 USB–RS232 (`/dev/cu.usbserial-1430` on the test Mac).
- RS-232: **9600 8N1**, no hardware or software flow control.
- Physical labels: **58 × 38 mm**, 2 mm gap, 40 mm pitch.
- Thermal raster: **55 bytes / 440 dots per row**, tested working height **280 rows / 35 mm**. Actual media is wider and taller than this raster area.
- Short and 280-row raster labels printed consecutively after a **1.5-second interval** between completed serial transmissions. This is an empirical operating setting, not a printer READY acknowledgement.
- RX/CTS/DSR status feedback was not observed. The OS reporting that bytes drained does **not** mean the printer has finished printing.

## Only active print protocol

The queue starts with one separate buffered registration label:

```text
ESC F0
ESC q040
ESC M01
ESC B
ESC A11 T3 CR
ESC E
ESC P01
```

That startup operation consumes **one physical label**. After it completes serial transmission, the host waits the configured inter-label interval.

Each actual label uses **Line Mode**: exactly 280 commands consisting of `ESC G55` plus 55 raw bitmap bytes, followed by one `FF` (`0x0C`). Every row is sent as one 59-byte chunk with **no intentional per-row delay**. There are no `ESC Q`, speed, density, additional feed or buffered graphic commands in the raster path.

After `tcdrain`, the application waits `labelIntervalSeconds` before sending the next label, including between different queue jobs. The default is **1.5 seconds**, adjustable under **Настройки принтера → Интервал между этикетками** (0.2–10 s). The queue stops on serial errors; it does not replay an uncertain label.

Existing settings JSON remains readable, but obsolete Q, X/Y, transport/pacing, sensor and flow-control fields are ignored. Existing templates and folders are left unchanged. New documents default to 58 × 38 mm and 2 mm gap.

The encoder rejects non-white content below the tested 35-mm printing height rather than silently clipping it. The physical media height remains 38 mm. Printable graphic width is limited to 55 mm by the historical `ESC G55` protocol.

## Usage

1. Connect the printer and select the `/dev/cu.*` RS-232 port in **Настройки**.
2. Open a template in **Редактор** or **Заполнение**, prepare content inside the 55 × 35 mm raster bounds, then add it to **Очередь**.
3. Start one job or the batch. The software prints the startup `T3` label once per queue run and then sends queued labels one by one.
4. Check the paper if transmission stops, especially after a partial write. Use the queue history and `~/Library/Application Support/LabelDesk/logs/print.log` to diagnose.

## Build and tests

Run `zsh Scripts/build-installer.sh` on an Intel Mac with Xcode. GitHub Actions builds the Intel package and runs Swift raster, quick-fill, updater and diagnostic tests. The macOS package is ad-hoc signed, not notarized.

The software has been changed to reflect actual hardware trials. **The new Swift serial implementation still requires a physical end-to-end test on the user's printer** before prolonged production use.

Download releases: https://github.com/bau59/LabelDesk_GoDEX_EZ_2/releases
