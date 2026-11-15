import Foundation
import Darwin

enum SerialPortError: LocalizedError {
    case noPortSelected
    case openFailed(String)
    case configurationFailed(String)
    case writeFailed(String)
    case invalidRaster
    case noActiveSeries

    var errorDescription: String? {
        switch self {
        case .noPortSelected: "Выберите последовательный порт в настройках."
        case .openFailed(let detail): "Не удалось открыть RS-232: \(detail)"
        case .configurationFailed(let detail): "Не удалось настроить RS-232: \(detail)"
        case .writeFailed(let detail): "Ошибка передачи RS-232: \(detail)"
        case .invalidRaster: "Неверная структура графических команд EZ-2."
        case .noActiveSeries: "Нет открытой последовательной серии для протяжки ленты."
        }
    }
}

/// One buffered T3 startup in a separate connection, then one persistent
/// Line Mode connection for all labels in the batch.
/// The printer gives no reliable end-of-print acknowledgement over this cable.
final class SerialPortService {
    private let lock = NSLock()
    private var seriesInitialized = false
    private var linePort: Int32 = -1
    private var previousLabelSentAt: Date?

    deinit {
        if linePort >= 0 { close(linePort) }
    }

    static func availablePorts() -> [String] {
        let directory = URL(fileURLWithPath: "/dev", isDirectory: true)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { $0.hasPrefix("cu.") }
            .map { directory.appendingPathComponent($0).path }.sorted()
    }

    func beginSeries() {
        lock.lock()
        defer { lock.unlock() }
        resetLocked()
    }

    func endSeries() {
        lock.lock()
        defer { lock.unlock() }
        resetLocked()
    }

    private func resetLocked() {
        if linePort >= 0 {
            close(linePort)
            linePort = -1
        }
        seriesInitialized = false
        previousLabelSentAt = nil
    }

    func sendLabel(_ raster: Data, startup: Data, lineSetup: Data,
                   profile: PrinterProfile,
                   onProgress: ((String) -> Void)? = nil) throws {
        lock.lock()
        defer { lock.unlock() }
        guard !profile.portPath.isEmpty else { throw SerialPortError.noPortSelected }

        // The encoder guarantees a common width for every Gnn line.
        guard raster.count >= 5,
              raster[0] == 0x1B, raster[1] == 0x47,
              raster[2] >= 0x30, raster[2] <= 0x39,
              raster[3] >= 0x30, raster[3] <= 0x39,
              raster.last == 0x0C else { throw SerialPortError.invalidRaster }
        let width = Int(raster[2] - 0x30) * 10 + Int(raster[3] - 0x30)
        let rowSize = width + 4
        guard (10...55).contains(width),
              (raster.count - 1) % rowSize == 0,
              (raster.count - 1) / rowSize <= GodexEZ2Encoder.printableRows else {
            throw SerialPortError.invalidRaster
        }

        do {
            if !seriesInitialized {
                onProgress?("buffered startup T3 (separate port session)")
                let fd = try openConfiguredPort(profile.portPath)
                do {
                    try sendBytes(startup, to: fd, chunkSize: startup.count)
                    try drain(fd)
                } catch {
                    close(fd)
                    throw error
                }
                close(fd)
                seriesInitialized = true
                previousLabelSentAt = Date()
            }

            if let previous = previousLabelSentAt {
                let remaining = profile.labelIntervalSeconds -
                    Date().timeIntervalSince(previous)
                if remaining > 0 {
                    onProgress?("waiting \(String(format: "%.2f", remaining))s")
                    Thread.sleep(forTimeInterval: remaining)
                }
            }

            if linePort < 0 {
                linePort = try openConfiguredPort(profile.portPath)
                // The tested 280-row Python batch sets F0/q040/M01 immediately
                // before starting the Line Mode stream, on this same open port.
                try sendBytes(lineSetup, to: linePort, chunkSize: lineSetup.count)
                onProgress?("line mode initialized: F0 q040 M01")
            }

            onProgress?("sending \((raster.count - 1) / rowSize) G\(width) rows + FF (\(raster.count) bytes)")
            try sendBytes(raster, to: linePort, chunkSize: rowSize)
            try drain(linePort)
            previousLabelSentAt = Date()
            onProgress?("TX drained; physical print is not acknowledged")
        } catch {
            resetLocked()
            throw error
        }
    }

    /// After the LAST copy of a queue job, advance exactly one blank-label
    /// pitch. This is intentionally separate from per-copy FF.
    /// ESC fnn (01...29 mm) is documented on the original 2002 EZ-2.
    func advanceAfterJob(_ commands: Data, intervalSeconds: Double,
                         onProgress: ((String) -> Void)? = nil) throws {
        lock.lock()
        defer { lock.unlock() }

        guard seriesInitialized, linePort >= 0 else {
            throw SerialPortError.noActiveSeries
        }
        // Never send an arbitrary motor command or more than one pitch.
        guard Array(commands) == [0x1B, 0x66, 0x32, 0x39,
                                  0x1B, 0x66, 0x31, 0x31] else {
            throw SerialPortError.writeFailed("Неверная команда протяжки.")
        }

        do {
            if let previous = previousLabelSentAt {
                let remaining = intervalSeconds - Date().timeIntervalSince(previous)
                if remaining > 0 {
                    onProgress?("waiting before tear feed \(String(format: "%.2f", remaining))s")
                    Thread.sleep(forTimeInterval: remaining)
                }
            }

            onProgress?("tear feed: ESC f29 + ESC f11 = 40mm (one blank label)")
            try sendBytes(commands, to: linePort, chunkSize: 4)
            try drain(linePort)
            previousLabelSentAt = Date()
            onProgress?("tear feed transmitted; physical paper position NOT confirmed")
        } catch {
            resetLocked()
            throw error
        }
    }

    private func openConfiguredPort(_ path: String) throws -> Int32 {
        let fd = open(path, O_RDWR | O_NOCTTY | O_NONBLOCK | O_EXLOCK)
        guard fd >= 0 else {
            throw SerialPortError.openFailed(String(cString: strerror(errno)))
        }
        do {
            var settings = termios()
            guard tcgetattr(fd, &settings) == 0 else {
                throw SerialPortError.configurationFailed(String(cString: strerror(errno)))
            }
            cfmakeraw(&settings)
            settings.c_cflag |= tcflag_t(CLOCAL | CREAD | CS8)
            settings.c_cflag &= ~tcflag_t(PARENB | CSTOPB)
            settings.c_iflag &= ~tcflag_t(IXON | IXOFF | IXANY)
            settings.c_cflag &= ~tcflag_t(CRTS_IFLOW | CCTS_OFLOW)
            guard cfsetispeed(&settings, speed_t(B9600)) == 0,
                  cfsetospeed(&settings, speed_t(B9600)) == 0,
                  tcsetattr(fd, TCSANOW, &settings) == 0 else {
                throw SerialPortError.configurationFailed(String(cString: strerror(errno)))
            }

            let flags = fcntl(fd, F_GETFL)
            guard flags >= 0,
                  fcntl(fd, F_SETFL, flags & ~O_NONBLOCK) == 0 else {
                throw SerialPortError.configurationFailed("Cannot enable blocking writes")
            }
            return fd
        } catch {
            close(fd)
            throw error
        }
    }

    private func sendBytes(_ data: Data, to fd: Int32, chunkSize: Int) throws {
        try data.withUnsafeBytes { buffer in
            guard let base = buffer.baseAddress else { return }
            var offset = 0
            while offset < buffer.count {
                let size = min(chunkSize, buffer.count - offset)
                var written = 0
                while written < size {
                    let n = Darwin.write(fd, base.advanced(by: offset + written), size - written)
                    if n < 0 {
                        if errno == EINTR { continue }
                        throw SerialPortError.writeFailed(String(cString: strerror(errno)))
                    }
                    if n == 0 { throw SerialPortError.writeFailed("No bytes accepted") }
                    written += n
                }
                offset += size
            }
        }
    }

    private func drain(_ fd: Int32) throws {
        guard tcdrain(fd) == 0 else {
            throw SerialPortError.writeFailed(String(cString: strerror(errno)))
        }
    }
}
