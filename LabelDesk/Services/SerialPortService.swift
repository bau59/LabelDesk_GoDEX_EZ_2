import Foundation
import Darwin

enum SerialPortError: LocalizedError {
    case noPortSelected
    case openFailed(String)
    case configurationFailed(String)
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .noPortSelected: "Выберите последовательный порт в настройках."
        case .openFailed(let detail): "Не удалось открыть RS-232: \(detail)"
        case .configurationFailed(let detail): "Не удалось настроить RS-232: \(detail)"
        case .writeFailed(let detail): "Ошибка передачи RS-232: \(detail)"
        }
    }
}

/// One synchronous sender for the entire queue. The adapter does not report
/// physical print completion: a configurable interval starts after tcdrain.
/// Each raster row is written as a single 59-byte ESC G55 packet.
final class SerialPortService {
    private let lock = NSLock()
    private var seriesInitialized = false
    private var previousLabelSentAt: Date?

    static func availablePorts() -> [String] {
        let directory = URL(fileURLWithPath: "/dev", isDirectory: true)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { $0.hasPrefix("cu.") }
            .map { directory.appendingPathComponent($0).path }.sorted()
    }

    /// A new explicit queue run always begins with one buffered T3 startup label.
    func beginSeries() {
        lock.lock()
        defer { lock.unlock() }
        seriesInitialized = false
        previousLabelSentAt = nil
    }

    func sendLabel(_ raster: Data, startup: Data, profile: PrinterProfile,
                   onProgress: ((String) -> Void)? = nil) throws {
        lock.lock()
        defer { lock.unlock() }

        guard !profile.portPath.isEmpty else { throw SerialPortError.noPortSelected }
        do {
            if !seriesInitialized {
                onProgress?("startup: sending buffered T3 on a separate connection")
                try sendPacket(startup, profile: profile, chunkSize: startup.count)
                seriesInitialized = true
                previousLabelSentAt = Date()
                onProgress?("startup sent; waiting for paper movement")
            }

            if let previous = previousLabelSentAt {
                let elapsed = Date().timeIntervalSince(previous)
                let remaining = max(0, profile.labelIntervalSeconds - elapsed)
                if remaining > 0 {
                    onProgress?("waiting \(String(format: "%.2f", remaining))s between labels")
                    Thread.sleep(forTimeInterval: remaining)
                }
            }

            onProgress?("line mode: \(GodexEZ2Encoder.printableRows) ESC G55 rows + FF")
            try sendPacket(raster, profile: profile, chunkSize: 59)
            previousLabelSentAt = Date()
            onProgress?("TX drained; printer has not acknowledged physical output")
        } catch {
            // A partial label leaves unknown paper position. No auto retry.
            seriesInitialized = false
            previousLabelSentAt = nil
            throw error
        }
    }

    private func sendPacket(_ packet: Data, profile: PrinterProfile,
                            chunkSize: Int) throws {
        let fd = open(profile.portPath, O_RDWR | O_NOCTTY | O_NONBLOCK | O_EXLOCK)
        guard fd >= 0 else { throw SerialPortError.openFailed(String(cString: strerror(errno))) }
        defer { close(fd) }

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
        guard flags >= 0, fcntl(fd, F_SETFL, flags & ~O_NONBLOCK) == 0 else {
            throw SerialPortError.configurationFailed("Cannot enable blocking writes")
        }

        try packet.withUnsafeBytes { raw in
            guard let base = raw.baseAddress else { return }
            var offset = 0
            while offset < raw.count {
                let count = min(chunkSize, raw.count - offset)
                var written = 0
                while written < count {
                    let n = Darwin.write(fd, base.advanced(by: offset + written), count - written)
                    if n < 0 {
                        if errno == EINTR { continue }
                        throw SerialPortError.writeFailed(String(cString: strerror(errno)))
                    }
                    if n == 0 { throw SerialPortError.writeFailed("No bytes accepted") }
                    written += n
                }
                offset += count
            }
        }
        guard tcdrain(fd) == 0 else {
            throw SerialPortError.writeFailed(String(cString: strerror(errno)))
        }
    }
}
