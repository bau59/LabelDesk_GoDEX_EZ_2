import AppKit
import CryptoKit
import Foundation

/// Integration test: validates exactly the same ZIP extraction/verification
/// entry point used by the in-app updater, not only the build/LabelDesk.app.
@main
struct UpdaterPackageSmoke {
    static func main() throws {
        guard CommandLine.arguments.count == 3 else {
            fatalError("Usage: updater-package-smoke <intel-zip> <version>")
        }
        let zip = URL(fileURLWithPath: CommandLine.arguments[1])
        let version = CommandLine.arguments[2]
        let bytes = try Data(contentsOf: zip)
        let sha256 = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        let asset = GitHubReleaseAsset(
            name: "LabelDesk-\(version)-intel.zip",
            browserDownloadURL: URL(string: "https://github.com/bau59/LabelDesk_GoDEX_EZ_2/releases/download/v\(version)/LabelDesk-\(version)-intel.zip")!,
            digest: "sha256:\(sha256)"
        )
        let fileManager = FileManager.default
        let temp = fileManager.temporaryDirectory
            .appendingPathComponent("LabelDesk-zip-smoke-\(UUID().uuidString)", isDirectory: true)
        try fileManager.createDirectory(at: temp, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: temp) }

        let downloaded = temp.appendingPathComponent("downloaded.zip")
        try bytes.write(to: downloaded, options: .atomic)
        let result = try UpdateManager.prepare(
            archive: downloaded, asset: asset, expectedVersion: version,
            expectedBundleID: "com.localsoft.LabelDesk"
        )
        defer { try? fileManager.removeItem(at: result.workspace) }
        let bundle = Bundle(url: result.app)
        assert(bundle?.bundleIdentifier == "com.localsoft.LabelDesk")
        assert(bundle?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String == version)
        assert(fileManager.fileExists(atPath: result.app.appendingPathComponent("Contents/MacOS/LabelDesk").path))
        print("PASS: Real Intel ZIP verified and extracted by in-app UpdateManager.prepare()")

        // A wrong checksum must fail before any attempt to install anything.
        let wrong = GitHubReleaseAsset(
            name: asset.name, browserDownloadURL: asset.browserDownloadURL,
            digest: "sha256:" + String(repeating: "0", count: 64)
        )
        let bad = temp.appendingPathComponent("bad-digest.zip")
        try bytes.write(to: bad, options: .atomic)
        do {
            _ = try UpdateManager.prepare(
                archive: bad, asset: wrong, expectedVersion: version,
                expectedBundleID: "com.localsoft.LabelDesk"
            )
            fatalError("Updater accepted a tampered checksum")
        } catch {
            guard error.localizedDescription.contains("SHA-256") else {
                throw error
            }
            print("PASS: Wrong archive digest rejected")
        }
    }
}
