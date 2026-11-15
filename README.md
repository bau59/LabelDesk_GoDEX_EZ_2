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

After the T3 startup label, the application waits the configured interval, opens one Line Mode serial connection and sends `ESC F0`, `ESC q040`, `ESC M01` again, exactly as in the successful full-size two-label terminal test. **The same serial port stays open for the entire batch.**

Each actual label consists of `ESC Gnn` rows followed by `FF` (`0x0C`). There is **no per-row delay**. The encoder uses the smallest constant `nn` from 10 to 55 bytes containing all ink and sends only the occupied height, rounded to whole millimeters, at least 32 and at most 280 rows. For content reaching the full tested area it still emits exactly `G55 × 280 + FF`. This avoids transmitting 16.5 KB for a one-word label.

After `tcdrain`, the application waits `labelIntervalSeconds` before sending the next label, including between different queue jobs. The persistent RS-232 connection closes after the batch or on an error. The default is **1.5 seconds**, adjustable under **Настройки принтера → Интервал между этикетками** (0.2–10 s). The queue stops on serial errors; it does not replay an uncertain label.

Existing settings JSON remains readable, but obsolete Q, X/Y, transport/pacing, sensor and flow-control fields are ignored. Existing templates and folders are left unchanged. New documents default to 58 × 38 mm and 2 mm gap.

The encoder rejects non-white content below the tested 35-mm printing height rather than silently clipping it. The physical media height remains 38 mm. Printable graphic width is limited to 55 mm by the historical `ESC G55` protocol.

## Version 0.9.5 — tear-off feed after each job

After all copies of a **PrintJob** have been transmitted (including their `FF`), the application waits the configured `labelIntervalSeconds` and issues **`ESC f29` followed by `ESC f11`** on the existing Line Mode RS-232 connection. The documented EZ-2 `ESC fnn` forwards paper by 01–29 mm per command, so these two commands total **40 mm**, equal to this roll's one 38 mm label + 2 mm gap. No blank raster is sent. The next job (if any) waits the configured interval after the feed.

This happens **once per job, not per copy**. On a feed/transmission error the job becomes uncertain and the queue stops without retrying. Because the connected printer supplies no verified physical completion response, this behavior is **not yet physically confirmed** and must first be tested with one job and one additional queued job.

The April 2002 EZ-2 manual also documents **`ESC Rnn`** for reverse feeding 01–29 mm, but it is **not used** by LabelDesk: reversing adhesive label stock may misregister or jam the mechanism and has not been tested.

## Usage

1. Connect the printer and select the `/dev/cu.*` RS-232 port in **Настройки**.
2. Open a template in **Редактор** or **Заполнение**, prepare content inside the 55 × 35 mm raster bounds, then add it to **Очередь**.
3. Start one job or the batch. The software prints the startup `T3` label once per queue run and then sends queued labels one by one.
4. Check the paper if transmission stops, especially after a partial write. Use the queue history and `~/Library/Application Support/LabelDesk/logs/print.log` to diagnose.

## Build and tests

Run `zsh Scripts/build-installer.sh` on an Intel Mac with Xcode. GitHub Actions builds the Intel package and runs Swift raster, quick-fill, updater and diagnostic tests. The macOS package is ad-hoc signed, not notarized.

Version 0.9.3 was physically tested and exposed an error: the T3 header alone did not reliably preserve next-label positioning, and fixed G55×280 took at least 17 seconds at 9600 baud even for tiny text. Version 0.9.4 corrects those discrepancies against the known-good terminal scripts. **The corrected Swift application still requires physical verification before production printing.**

Download releases: https://github.com/bau59/LabelDesk_GoDEX_EZ_2/releases
