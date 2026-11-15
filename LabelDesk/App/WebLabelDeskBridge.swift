import AppKit
import CryptoKit
import Foundation
import WebKit

/// The only Swift bridge in LabelDesk: JSON persistence, a safe local file URL
/// and running the editable zsh driver. No printer protocol or raster code here.
final class WebLabelDeskBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    weak var webView: WKWebView?
    private let fm = FileManager.default
    private let root: URL
    private let runtime: URL
    private var activeProcess: Process?

    override init() {
        let support = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        )[0].appendingPathComponent("LabelDesk", isDirectory: true)
        root = support
        runtime = support.appendingPathComponent("live", isDirectory: true)
        super.init()
    }

    /// Copies only the 5 editable runtime files, never touching templates,
    /// queue or settings. On upgrades unchanged stock files can be refreshed;
    /// files modified by the user remain untouched.
    func prepareRuntime() throws -> URL {
        try fm.createDirectory(at: runtime, withIntermediateDirectories: true)
        try fm.createDirectory(at: root.appendingPathComponent("templates"), withIntermediateDirectories: true)
        try fm.createDirectory(at: root.appendingPathComponent("spool"), withIntermediateDirectories: true)
        let manifestURL = runtime.appendingPathComponent(".bundled-hashes.json")
        let old = (readJSON(manifestURL) as? [String: String]) ?? [:]
        var newHashes: [String: String] = [:]

        for file in ["app.html", "app.js", "editor.html", "barcodes.js", "raster.js", "printer.sh"] {
            let ext = (file as NSString).pathExtension
            let basename = (file as NSString).deletingPathExtension
            guard let bundled = Bundle.main.url(forResource: basename, withExtension: ext) else {
                throw NSError(domain: "LabelDesk", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "Missing runtime file: \(file)"])
            }
            let source = try Data(contentsOf: bundled)
            let hash = sha256(source)
            newHashes[file] = hash
            let local = runtime.appendingPathComponent(file)
            if fm.fileExists(atPath: local.path) {
                let localData = try Data(contentsOf: local)
                if let previous = old[file], previous == sha256(localData), previous != hash {
                    try source.write(to: local, options: .atomic)
                }
            } else {
                try source.write(to: local, options: .atomic)
            }
        }

        let manifest = try JSONSerialization.data(withJSONObject: newHashes,
                                                  options: [.sortedKeys])
        try manifest.write(to: manifestURL, options: .atomic)
        return runtime
    }

    private func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private func readJSON(_ url: URL) -> Any? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }

    private func writeJSON(_ text: String, to url: URL) throws {
        let data = Data(text.utf8)
        guard data.count <= 20_000_000 else {
            throw NSError(domain: "LabelDesk", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "JSON file is too large"])
        }
        _ = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        try data.write(to: url, options: .atomic)
    }

    private func respond(_ id: Int, result: Any = NSNull(), error: String? = nil) {
        let message: [String: Any] = [
            "id": id,
            "result": result,
            "error": (error as Any?) ?? NSNull()
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: message,
                                                     options: [.fragmentsAllowed]),
              let text = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.labelDeskReceive(\(text));",
                                    completionHandler: nil)
    }

    private func templateFile(_ id: String) throws -> URL {
        guard let uuid = UUID(uuidString: id) else {
            throw NSError(domain: "LabelDesk", code: 3,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid template UUID"])
        }
        return root.appendingPathComponent("templates", isDirectory: true)
            .appendingPathComponent(uuid.uuidString + ".json")
    }

    private func templates() -> [[String: Any]] {
        let dir = root.appendingPathComponent("templates", isDirectory: true)
        let paths = (try? fm.contentsOfDirectory(at: dir,
                      includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        return paths.filter { $0.pathExtension == "json" }
            .sorted { ($0.lastPathComponent) < ($1.lastPathComponent) }
            .compactMap { readJSON($0) as? [String: Any] }
    }

    private func loadAll() -> [String: Any] {
        var settings = (readJSON(root.appendingPathComponent("settings.json"))
                        as? [String: Any]) ?? [:]
        if settings["profile"] == nil {
            settings["profile"] = ["portPath":
                UserDefaults.standard.string(forKey: "serialPort") ?? ""]
        }
        return [
            "templates": templates(),
            "settings": settings,
            "folders": readJSON(root.appendingPathComponent("folders.json")) ?? [],
            "queue": readJSON(root.appendingPathComponent("queue.json")) ?? [],
            "runtimePath": runtime.path
        ]
    }

    private func ports() -> [String] {
        ((try? fm.contentsOfDirectory(atPath: "/dev")) ?? [])
            .filter { $0.hasPrefix("cu.") }
            .map { "/dev/" + $0 }
            .sorted()
    }

    private func appendLog(_ message: String) {
        let dir = root.appendingPathComponent("logs", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let path = dir.appendingPathComponent("shell-driver.log")
        let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
        let bytes = Data(line.utf8)
        if !fm.fileExists(atPath: path.path) {
            try? bytes.write(to: path, options: .atomic)
        } else if let handle = try? FileHandle(forWritingTo: path) {
            handle.seekToEndOfFile()
            handle.write(bytes)
            try? handle.close()
        }
    }

    private func startPrint(id: Int, body: [String: Any]) throws {
        guard activeProcess == nil else {
            throw NSError(domain: "LabelDesk", code: 4,
                          userInfo: [NSLocalizedDescriptionKey: "Another print job is active"])
        }
        guard let port = body["port"] as? String,
              port.hasPrefix("/dev/cu."),
              !port.dropFirst(8).contains("/"),
              port.utf8.count < 150,
              let delay = body["delay"] as? Double,
              delay.isFinite, (0.2...10).contains(delay),
              let copies = body["copies"] as? Int,
              (1...200).contains(copies),
              let first = body["first"] as? Bool,
              let base64 = body["base64"] as? String,
              base64.utf8.count < 60_000,
              let packet = Data(base64Encoded: base64),
              (5...20_000).contains(packet.count) else {
            throw NSError(domain: "LabelDesk", code: 5,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid serial job arguments"])
        }
        let spool = root.appendingPathComponent("spool", isDirectory: true)
            .appendingPathComponent(UUID().uuidString + ".bin")
        try packet.write(to: spool, options: .atomic)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = [
            runtime.appendingPathComponent("printer.sh").path, port,
            spool.path, String(copies), first ? "1" : "0", String(delay)
        ]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        activeProcess = process

        process.terminationHandler = { [weak self] finished in
            let output = pipe.fileHandleForReading.readDataToEndOfFile()
            let details = String(data: output, encoding: .utf8) ?? ""
            DispatchQueue.main.async {
                guard let self else { return }
                self.activeProcess = nil
                try? self.fm.removeItem(at: spool)
                self.appendLog("exit=\(finished.terminationStatus) \(details)")
                if finished.terminationStatus == 0 {
                    self.respond(id, result: [
                        "output": details,
                        "message": "Serial transmission completed; paper output is unconfirmed"
                    ])
                } else {
                    self.respond(id, error:
                        "Driver exit \(finished.terminationStatus): \(details)")
                }
            }
        }

        do {
            try process.run()
        } catch {
            activeProcess = nil
            try? fm.removeItem(at: spool)
            throw error
        }
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "labelDesk", message.frameInfo.isMainFrame,
              let request = message.body as? [String: Any],
              let id = request["id"] as? Int,
              let action = request["action"] as? String else { return }
        let body = request["data"] as? [String: Any] ?? [:]
        do {
            switch action {
            case "loadAll":
                respond(id, result: loadAll())
            case "ports":
                respond(id, result: ports())
            case "openRuntime":
                NSWorkspace.shared.open(runtime)
                respond(id, result: true)
            case "saveData":
                guard let key = body["key"] as? String,
                      ["settings", "folders", "queue"].contains(key),
                      let json = body["json"] as? String else {
                    throw NSError(domain: "LabelDesk", code: 6,
                                  userInfo: [NSLocalizedDescriptionKey: "Invalid saveData"])
                }
                try writeJSON(json, to: root.appendingPathComponent(key + ".json"))
                respond(id, result: true)
            case "saveTemplate":
                guard let raw = body["document"] as? String,
                      raw.utf8.count <= 512_000,
                      let data = raw.data(using: .utf8),
                      let item = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let identifier = item["id"] as? String,
                      let elements = item["elements"] as? [Any],
                      elements.count <= 150 else {
                    throw NSError(domain: "LabelDesk", code: 7,
                                  userInfo: [NSLocalizedDescriptionKey: "Invalid template"])
                }
                try writeJSON(raw, to: try templateFile(identifier))
                respond(id, result: true)
            case "deleteTemplate":
                guard let identifier = body["id"] as? String else {
                    throw NSError(domain: "LabelDesk", code: 8,
                                  userInfo: [NSLocalizedDescriptionKey: "Missing UUID"])
                }
                let path = try templateFile(identifier)
                if fm.fileExists(atPath: path.path) { try fm.removeItem(at: path) }
                respond(id, result: true)
            case "printJob":
                try startPrint(id: id, body: body)
                // Response is asynchronous from Process.terminationHandler.
            case "cancelPrint":
                if let process = activeProcess, process.isRunning {
                    process.terminate()
                }
                respond(id, result: true)
            default:
                respond(id, error: "Unsupported action: \(action)")
            }
        } catch {
            respond(id, error: error.localizedDescription)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, url.isFileURL,
           url.path.hasPrefix(runtime.path + "/") {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        _ = alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "Продолжить")
        alert.addButton(withTitle: "Отмена")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        alert.addButton(withTitle: "Создать")
        alert.addButton(withTitle: "Отмена")
        let field = NSTextField(string: defaultText ?? "")
        field.frame = NSRect(x: 0, y: 0, width: 280, height: 24)
        alert.accessoryView = field
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }
}
