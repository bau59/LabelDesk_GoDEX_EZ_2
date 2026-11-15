import Foundation

/// App-local serial transmission diagnostics. No raw label text or graphics
/// bytes are recorded: only timing, port settings, byte counts and stages.
@MainActor
final class PrintDiagnostics: ObservableObject {
    @Published private(set) var entries: [String] = []
    @Published private(set) var writeError: String?

    let fileURL: URL
    private let previousURL: URL
    private let maxBytes = 1_500_000
    private let dateFormatter = ISO8601DateFormatter()

    init(rootURL: URL? = nil) {
        // Millisecond timestamps show whether TX time is spent writing,
        // waiting for the adapter, or simply waiting in the UI actor.
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let root = rootURL ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LabelDesk", isDirectory: true)
        let folder = root.appendingPathComponent("logs", isDirectory: true)
        fileURL = folder.appendingPathComponent("print.log")
        previousURL = folder.appendingPathComponent("print.previous.log")
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            if let data = try? Data(contentsOf: fileURL),
               let content = String(data: data, encoding: .utf8) {
                entries = Array(content.split(separator: "\n").suffix(150)).map(String.init)
            }
        } catch {
            writeError = error.localizedDescription
        }
        record("app", details: "Журнал передачи открыт; отметка «Передано» не подтверждает физическую печать")
    }

    func record(_ event: String, jobID: UUID? = nil, details: String = "") {
        let time = dateFormatter.string(from: Date())
        let job = jobID.map { " job=\($0.uuidString)" } ?? ""
        let detail = details.isEmpty ? "" : " \(details.replacingOccurrences(of: "\n", with: " "))"
        let line = "\(time) [\(event)]\(job)\(detail)"
        entries.append(line)
        if entries.count > 300 { entries.removeFirst(entries.count - 300) }
        do {
            let folder = fileURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
               (attrs[.size] as? NSNumber)?.intValue ?? 0 > maxBytes {
                if FileManager.default.fileExists(atPath: previousURL.path) {
                    try FileManager.default.removeItem(at: previousURL)
                }
                try FileManager.default.moveItem(at: fileURL, to: previousURL)
            }
            let data = Data((line + "\n").utf8)
            if FileManager.default.fileExists(atPath: fileURL.path) {
                let handle = try FileHandle(forWritingTo: fileURL)
                defer { try? handle.close() }
                try handle.seekToEnd()
                try handle.write(contentsOf: data)
            } else {
                try data.write(to: fileURL, options: .atomic)
            }
            writeError = nil
        } catch {
            writeError = "Не удаётся записать журнал: \(error.localizedDescription)"
        }
    }

    var visibleText: String {
        entries.joined(separator: "\n")
    }
}
