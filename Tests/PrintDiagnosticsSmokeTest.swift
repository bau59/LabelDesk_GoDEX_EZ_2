import Foundation

@main
struct PrintDiagnosticsSmokeTest {
    @MainActor
    static func main() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("LabelDesk-log-test-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let first = PrintDiagnostics(rootURL: root)
        let id = UUID()
        first.record("queued", jobID: id, details: "copies=2 size=40x30mm")
        first.record("serial", jobID: id, details: "port opened")
        first.record("serial returned", jobID: id,
                     details: "bytes=800 elapsed=1.0s; physical output not confirmed")

        assert(first.fileURL.path.hasSuffix("logs/print.log"))
        assert(first.writeError == nil, first.writeError ?? "unknown")
        let contents = try String(contentsOf: first.fileURL, encoding: .utf8)
        assert(contents.contains("serial returned"))
        assert(contents.contains(id.uuidString))
        assert(contents.contains("physical output not confirmed"))

        let reopened = PrintDiagnostics(rootURL: root)
        assert(reopened.visibleText.contains("copies=2"))
        assert(reopened.visibleText.contains("port opened"))
        assert(reopened.writeError == nil)

        print("PASS: Print diagnostic log created, persisted and reloaded.")
    }
}
