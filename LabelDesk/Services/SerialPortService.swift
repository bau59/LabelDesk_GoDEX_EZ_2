import Foundation
import Darwin

enum SerialPortError: LocalizedError {
    case noPortSelected
    case openFailed(String)
    case configurationFailed(String)
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .noPortSelected: "Choose a serial port in Printer settings."
        case .openFailed(let detail): "Cannot open serial port: \(detail)"
        case .configurationFailed(let detail): "Cannot configure serial port: \(detail)"
        case .writeFailed(let detail): "Serial write failed: \(detail)"
        }
    }
}

final class SerialPortService {
    static func availablePorts() -> [String] {
        let directory = URL(fileURLWithPath: "/dev", isDirectory: true)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { $0.hasPrefix("cu.") }.map { directory.appendingPathComponent($0).path }.sorted()
    }

    /// A successful return only means the serial driver accepted/drained the
    /// bytes. EZ-2 provides no confirmed printed-label acknowledgement here.
    func write(_ data: Data, profile: PrinterProfile, onProgress: ((String) -> Void)? = nil) throws {
        guard !profile.portPath.isEmpty else { throw SerialPortError.noPortSelected }
        let descriptor = open(profile.portPath, O_WRONLY | O_NOCTTY | O_NONBLOCK | O_EXLOCK)
        guard descriptor >= 0 else { throw SerialPortError.openFailed(String(cString: strerror(errno))) }
        defer { close(descriptor) }
        onProgress?("port opened")
        try configure(descriptor, profile: profile)
        onProgress?("serial configured baud=9600 8N1 flow=\(profile.flowControl.rawValue)")
        // The original Phase 1 test was tiny; raster jobs can exceed the
        // kernel's nonblocking TX buffer. Keep the port blocking after setup.
        let flags = fcntl(descriptor, F_GETFL)
        guard flags >= 0, fcntl(descriptor, F_SETFL, flags & ~O_NONBLOCK) == 0 else {
            throw SerialPortError.configurationFailed("Cannot enable blocking serial writes.")
        }

        var sent = 0
        try data.withUnsafeBytes { rawBuffer in
            guard var pointer = rawBuffer.baseAddress else { return }
            var remaining = rawBuffer.count
            while remaining > 0 {
                let count = Darwin.write(descriptor, pointer, remaining)
                if count < 0 {
                    if errno == EINTR { continue }
                    throw SerialPortError.writeFailed(String(cString: strerror(errno)))
                }
                if count == 0 { throw SerialPortError.writeFailed("no bytes accepted") }
                remaining -= count
                sent += count
                pointer = pointer.advanced(by: count)
                if sent == data.count || sent % 4096 < count {
                    onProgress?("bytes accepted \(sent)/\(data.count)")
                }
            }
        }
        onProgress?("waiting for serial driver to drain TX buffer")
        guard tcdrain(descriptor) == 0 else {
            throw SerialPortError.writeFailed(String(cString: strerror(errno)))
        }
        onProgress?("TX driver drained; physical print NOT confirmed")
    }

    private func configure(_ descriptor: Int32, profile: PrinterProfile) throws {
        var settings = termios()
        guard tcgetattr(descriptor, &settings) == 0 else {
            throw SerialPortError.configurationFailed(String(cString: strerror(errno)))
        }
        cfmakeraw(&settings)
        settings.c_cflag |= tcflag_t(CLOCAL | CREAD | CS8)
        settings.c_cflag &= ~tcflag_t(PARENB | CSTOPB)
        settings.c_iflag &= ~tcflag_t(IXON | IXOFF | IXANY)
        settings.c_cflag &= ~tcflag_t(CRTS_IFLOW | CCTS_OFLOW)
        switch profile.flowControl {
        case .none: break
        case .xonXoff: settings.c_iflag |= tcflag_t(IXON | IXOFF)
        case .rtsCts: settings.c_cflag |= tcflag_t(CRTS_IFLOW | CCTS_OFLOW)
        }
        let speed: speed_t = profile.baudRate == 9600 ? speed_t(B9600) : speed_t(B9600)
        guard cfsetispeed(&settings, speed) == 0, cfsetospeed(&settings, speed) == 0,
              tcsetattr(descriptor, TCSANOW, &settings) == 0 else {
            throw SerialPortError.configurationFailed(String(cString: strerror(errno)))
        }
    }
}
