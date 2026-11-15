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

After the T3 startup label, the application waits the configured interval, opens one Line Mode serial connection and sends `ESC F0`, `ESC q040`, `ESC M01` again, exactly as in the successful full-size two-label terminal test. **The Line Mode port stays open across copies of the same job; it closes before each separate buffered blank-label separator.**

Each actual label consists of `ESC Gnn` rows followed by `FF` (`0x0C`). There is **no per-row delay**. The encoder uses the smallest constant `nn` from 10 to 55 bytes containing all ink and sends only the occupied height, rounded to whole millimeters, at least 32 and at most 280 rows. For content reaching the full tested area it still emits exactly `G55 × 280 + FF`. This avoids transmitting 16.5 KB for a one-word label.

After `tcdrain`, the application waits `labelIntervalSeconds` before sending the next label, including between different queue jobs. A Line Mode RS-232 connection is reopened between jobs after the blank-label separator. The default is **1.5 seconds**, adjustable under **Настройки принтера → Интервал между этикетками** (0.2–10 s). The queue stops on serial errors; it does not replay an uncertain label.

Existing settings JSON remains readable, but obsolete Q, X/Y, transport/pacing, sensor and flow-control fields are ignored. Existing templates and folders are left unchanged. New documents default to 58 × 38 mm and 2 mm gap.

The encoder rejects non-white content below the tested 35-mm printing height rather than silently clipping it. The physical media height remains 38 mm. Printable graphic width is limited to 55 mm by the historical `ESC G55` protocol.

## Version 0.9.5 — blank-label separator after each job

After the last copy of each PrintJob (`ESC Gnn` + `FF`), wait the configured interval, drain and close the Line Mode serial connection. Then open a **separate** RS-232 connection and send a buffered, blank one-label job:

```text
ESC F0
ESC q040
ESC M01
ESC B
ESC A11 [ASCII SPACE] CR
ESC E
ESC P01
```

This exact packet **has been physically tested in isolation**: it moves the 58 × 38 mm stock with 2 mm gap forward to the next label. Close the blank-label port after `tcdrain`. Before another job, reopen the Line Mode connection and resend `F0/q040/M01`, but **do not print T3 again** within the same batch. The previous line-by-line serial protocol and per-copy delays remain unchanged.

The separator runs **once per PrintJob**, never between copies of the same job. On error the queue stops as uncertain without retrying. The blank operation was physically confirmed separately; **the integration of Line Mode → blank buffered job → Line Mode still needs a short physical test**. The former experimental `ESC f29 + ESC f11` motor-feed approach has been removed; it was never tested physically.

The original EZ-2 documentation also lists reverse feed `ESC Rnn` (1–29 mm), which is **not used automatically**, because reversing adhesive stock can affect registration and has not been physically tested.

## Usage

1. Connect the printer and select the `/dev/cu.*` RS-232 port in **Настройки**.
2. Open a template in **Редактор** or **Заполнение**, prepare content inside the 55 × 35 mm raster bounds, then add it to **Очередь**.
3. Start one job or the batch. The software prints the startup `T3` label once per queue run and then sends queued labels one by one.
4. Check the paper if transmission stops, especially after a partial write. Use the queue history and `~/Library/Application Support/LabelDesk/logs/print.log` to diagnose.

## Build and tests

Run `zsh Scripts/build-installer.sh` on an Intel Mac with Xcode. GitHub Actions builds the Intel package and runs Swift raster, quick-fill, updater and diagnostic tests. The macOS package is ad-hoc signed, not notarized.

Version 0.9.3 was physically tested and exposed an error: the T3 header alone did not reliably preserve next-label positioning, and fixed G55×280 took at least 17 seconds at 9600 baud even for tiny text. Version 0.9.4 corrects those discrepancies against the known-good terminal scripts. **The corrected Swift application still requires physical verification before production printing.**

Download releases: https://github.com/bau59/LabelDesk_GoDEX_EZ_2/releases
