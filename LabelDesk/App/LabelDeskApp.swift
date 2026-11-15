import SwiftUI
import Foundation
import Darwin

@main
struct LabelDeskApp: App {
    @StateObject private var printer = PrinterModel()
    @StateObject private var updater = UpdateManager()
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            MainView()
                .preferredColorScheme(.light)
                .environmentObject(store)
                .environmentObject(printer)
                .environmentObject(updater)
                .frame(minWidth: 1020, minHeight: 690)
        }
    }
}

private struct ContentView: View {
    @EnvironmentObject private var printer: PrinterModel
    @EnvironmentObject private var updater: UpdateManager

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("LabelDesk").font(.largeTitle)
            Text("GoDEX EZ-2 · USB–RS232 test").foregroundStyle(.secondary)
            GroupBox("Serial port") {
                HStack {
                    Picker("Port", selection: $printer.selectedPort) {
                        Text("Choose a port").tag("")
                        ForEach(printer.ports, id: \.self) { Text($0).tag($0) }
                    }
                    Button("Refresh") { printer.refreshPorts() }
                }
                Text("9600 baud · 8 data bits · no parity · 1 stop bit · no flow control")
                    .font(.caption).foregroundStyle(.secondary)
            }
            GroupBox("Verified test") {
                Text("Sends the command sequence that previously printed TEST on this printer. No job is sent automatically.")
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Button("Print TEST") { printer.confirmTest = true }
                    .buttonStyle(.borderedProminent)
                    .disabled(printer.selectedPort.isEmpty || printer.isSending)
                if printer.isSending { ProgressView().controlSize(.small) }
                Text(printer.status).foregroundStyle(printer.status.hasPrefix("Error") ? .red : .secondary)
            }
            GroupBox("Application updates") {
                HStack(spacing: 10) {
                    Text("v\(updater.currentVersion) · \(updater.status)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    if updater.isChecking || updater.isDownloading {
                        ProgressView().controlSize(.small)
                    }
                    Button("Check for Updates") {
                        Task { await updater.check(silent: false) }
                    }
                    .disabled(updater.isChecking || updater.isDownloading)
                }
            }
            .alert("Update available", isPresented: $updater.showUpdatePrompt) {
                Button("Install and restart") {
                    Task { await updater.installUpdate() }
                }
                Button("Later", role: .cancel) { }
            } message: {
                Text("LabelDesk v\(updater.latestVersion) is available. Save unsaved work before installing. The app will close, update and reopen automatically.")
            }
            .alert("LabelDesk updates", isPresented: $updater.showInfo) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(updater.infoMessage)
            }
            Spacer()
        }
        .padding(24)
        .task { await updater.checkOnLaunch() }
        .alert("Print TEST?", isPresented: $printer.confirmTest) {
            Button("Send") { printer.sendTest() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Ensure paper is loaded. The app will send data to \(printer.selectedPort).")
        }
    }
}

private final class PrinterModel: ObservableObject {
    @Published var ports: [String] = []
    @Published var selectedPort: String { didSet { UserDefaults.standard.set(selectedPort, forKey: "serialPort") } }
    @Published var status = "Choose the USB–RS232 port"
    @Published var isSending = false
    @Published var confirmTest = false

    init() {
        selectedPort = UserDefaults.standard.string(forKey: "serialPort") ?? ""
        refreshPorts()
    }

    func refreshPorts() {
        let devices = ((try? FileManager.default.contentsOfDirectory(atPath: "/dev")) ?? [])
            .filter { $0.hasPrefix("cu.") }
            .map { "/dev/\($0)" }
            .sorted()
        ports = devices
        if !devices.contains(selectedPort) {
            selectedPort = devices.first(where: { $0.contains("usbserial") }) ?? devices.first ?? ""
        }
        status = selectedPort.isEmpty ? "No serial ports found" : "Ready: \(selectedPort)"
    }

    func sendTest() {
        let path = selectedPort
        guard !path.isEmpty else { return }
        isSending = true
        status = "Sending TEST…"
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Self.writeTest(to: path)
            DispatchQueue.main.async {
                self.isSending = false
                switch result {
                case .success: self.status = "Sent to serial port (physical print not confirmed)"
                case .failure(let error): self.status = "Error: \(error.localizedDescription)"
                }
            }
        }
    }

    private static func writeTest(to path: String) -> Result<Void, Error> {
        let descriptor = open(path, O_WRONLY | O_NOCTTY | O_NONBLOCK | O_EXLOCK)
        guard descriptor >= 0 else { return .failure(SerialError("Cannot open port: \(String(cString: strerror(errno)))")) }
        defer { close(descriptor) }
        var settings = termios()
        guard tcgetattr(descriptor, &settings) == 0 else { return .failure(SerialError("Cannot read port settings")) }
        cfmakeraw(&settings)
        settings.c_cflag |= tcflag_t(CLOCAL | CREAD | CS8)
        settings.c_cflag &= ~tcflag_t(PARENB | CSTOPB | CRTS_IFLOW | CCTS_OFLOW)
        settings.c_iflag &= ~tcflag_t(IXON | IXOFF | IXANY)
        guard cfsetispeed(&settings, speed_t(B9600)) == 0,
              cfsetospeed(&settings, speed_t(B9600)) == 0,
              tcsetattr(descriptor, TCSANOW, &settings) == 0 else {
            return .failure(SerialError("Cannot configure port: \(String(cString: strerror(errno)))"))
        }
        let bytes: [UInt8] = [0x1B, 0x51, 0x31, 0x37, 0x36, 0x1B, 0x53, 0x32, 0x1B, 0x44, 0x35, 0x1B, 0x4D, 0x31, 0x38, 0x1B, 0x41, 0x31, 0x31, 0x54, 0x45, 0x53, 0x54, 0x0D, 0x0C]
        let sent = bytes.withUnsafeBytes { buffer -> Int in
            guard let address = buffer.baseAddress else { return -1 }
            return write(descriptor, address, bytes.count)
        }
        guard sent == bytes.count else { return .failure(SerialError("Write failed: \(String(cString: strerror(errno)))")) }
        _ = tcdrain(descriptor)
        return .success(())
    }
}

private struct SerialError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
