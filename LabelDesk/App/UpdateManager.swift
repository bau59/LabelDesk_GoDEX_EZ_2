import AppKit
import Combine
import CryptoKit
import Foundation

private struct GitHubRelease: Decodable {
    let tagName: String
    let assets: [GitHubReleaseAsset]

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case assets
    }
}

private struct GitHubReleaseAsset: Decodable {
    let name: String
    let browserDownloadURL: URL
    let digest: String?

    enum CodingKeys: String, CodingKey {
        case name
        case browserDownloadURL = "browser_download_url"
        case digest
    }
}

private enum UpdateError: LocalizedError {
    case unexpectedResponse
    case invalidRelease
    case missingInstaller
    case checksumMissing
    case checksumMismatch
    case invalidBundle
    case permissionDenied
    case notInstalled
    case resourceMissing
    case commandFailed(String)

    var errorDescription: String? {
        switch self {
        case .unexpectedResponse: return "GitHub returned an unexpected response."
        case .invalidRelease: return "GitHub returned an invalid release version."
        case .missingInstaller: return "This release has no Intel ZIP installer."
        case .checksumMissing: return "GitHub did not provide a SHA-256 digest. Automatic installation was cancelled."
        case .checksumMismatch: return "The downloaded archive does not match GitHub's SHA-256 digest."
        case .invalidBundle: return "The downloaded app's signature, bundle ID, version or Intel architecture is invalid."
        case .permissionDenied: return "Applications folder is not writable by this user. Install the new version manually."
        case .notInstalled: return "Automatic installation is available only for LabelDesk.app in /Applications or ~/Applications."
        case .resourceMissing: return "The updater helper is missing from this version of LabelDesk."
        case .commandFailed(let text): return "Unable to prepare the update: \(text)"
        }
    }
}

@MainActor
final class UpdateManager: ObservableObject {
    @Published var status = "Updates checked daily"
    @Published var isChecking = false
    @Published var isDownloading = false
    @Published var latestVersion = ""
    @Published var showUpdatePrompt = false
    @Published var showInfo = false
    @Published var infoMessage = ""

    let currentVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    private let lastCheckKey = "LabelDeskLastUpdateCheck"
    private let releasesURL = URL(string: "https://api.github.com/repos/bau59/LabelDesk_GoDEX_EZ_2/releases/latest")!
    private var selectedAsset: GitHubReleaseAsset?

    func checkOnLaunch() async {
        let last = UserDefaults.standard.double(forKey: lastCheckKey)
        guard Date().timeIntervalSince1970 - last >= 24 * 60 * 60 else { return }
        await check(silent: true)
    }

    func check(silent: Bool) async {
        guard !isChecking, !isDownloading else { return }
        isChecking = true
        defer { isChecking = false }

        do {
            var request = URLRequest(url: releasesURL)
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            request.setValue("LabelDesk/\(currentVersion)", forHTTPHeaderField: "User-Agent")
            request.timeoutInterval = 15
            request.cachePolicy = .reloadIgnoringLocalCacheData

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw UpdateError.unexpectedResponse }
            if http.statusCode == 404 {
                recordCheck()
                status = "No published releases"
                if !silent { inform("There are no published GitHub releases yet.") }
                return
            }
            guard http.statusCode == 200 else { throw UpdateError.unexpectedResponse }

            let release = try JSONDecoder().decode(GitHubRelease.self, from: data)
            let version = release.tagName.hasPrefix("v") ? String(release.tagName.dropFirst()) : release.tagName
            guard version.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil else {
                throw UpdateError.invalidRelease
            }
            recordCheck()

            if version.compare(currentVersion, options: .numeric) != .orderedDescending {
                selectedAsset = nil
                status = "Up to date"
                if !silent { inform("LabelDesk v\(currentVersion) is up to date.") }
                return
            }
            guard let asset = release.assets.first(where: { $0.name == "LabelDesk-\(version)-intel.zip" }),
                  asset.browserDownloadURL.scheme == "https",
                  asset.browserDownloadURL.host == "github.com",
                  asset.browserDownloadURL.path.hasPrefix("/bau59/LabelDesk_GoDEX_EZ_2/releases/download/") else {
                throw UpdateError.missingInstaller
            }
            selectedAsset = asset
            latestVersion = version
            status = "v\(version) available"
            showUpdatePrompt = true
        } catch {
            status = "Update check failed"
            if !silent { inform(error.localizedDescription) }
        }
    }

    /// Prepares and verifies an app update, launches an independent helper, then quits.
    /// The helper waits for this process to exit before replacing the app and reopening it.
    func installUpdate() async {
        guard let asset = selectedAsset, !isDownloading else { return }
        isDownloading = true
        status = "Preparing update…"
        defer { isDownloading = false }

        var workspace: URL?
        do {
            let installed = Bundle.main.bundleURL.resolvingSymlinksInPath()
            let parent = installed.deletingLastPathComponent()
            let homeApplications = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Applications", isDirectory: true)
            guard installed.lastPathComponent == "LabelDesk.app",
                  parent.path == "/Applications" || parent.path == homeApplications.path else {
                throw UpdateError.notInstalled
            }
            guard FileManager.default.isWritableFile(atPath: parent.path) else {
                throw UpdateError.permissionDenied
            }
            guard let helper = Bundle.main.url(forResource: "install-update", withExtension: "sh") else {
                throw UpdateError.resourceMissing
            }

            status = "Downloading v\(latestVersion)…"
            let (download, response) = try await URLSession.shared.download(from: asset.browserDownloadURL)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw UpdateError.unexpectedResponse
            }

            status = "Verifying Intel update…"
            let requestedVersion = latestVersion
            let result = try await Task.detached(priority: .userInitiated) {
                try Self.prepare(
                    archive: download, asset: asset,
                    expectedVersion: requestedVersion, expectedBundleID: "com.localsoft.LabelDesk"
                )
            }.value
            workspace = result.workspace

            // Run helper outside the bundle that is about to be replaced.
            let helperCopy = result.workspace.appendingPathComponent("install-update.sh")
            try FileManager.default.copyItem(at: helper, to: helperCopy)

            let installer = Process()
            installer.executableURL = URL(fileURLWithPath: "/bin/zsh")
            installer.arguments = [
                helperCopy.path,
                String(ProcessInfo.processInfo.processIdentifier),
                installed.path,
                result.app.path,
                result.workspace.path
            ]
            try installer.run()

            status = "Closing for update…"
            NSApplication.shared.terminate(nil)
        } catch {
            if let workspace { try? FileManager.default.removeItem(at: workspace) }
            status = "Automatic update failed"
            inform(error.localizedDescription + " Download and install the DMG manually from GitHub Releases.")
        }
    }

    private func recordCheck() {
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: lastCheckKey)
    }

    nonisolated private static func prepare(
        archive: URL, asset: GitHubReleaseAsset,
        expectedVersion: String, expectedBundleID: String
    ) throws -> (workspace: URL, app: URL) {
        try verifyDigest(file: archive, expected: asset.digest)
        let fm = FileManager.default
        let workspace = fm.temporaryDirectory.appendingPathComponent("LabelDesk-update-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: workspace, withIntermediateDirectories: false)
        do {
            let zipFile = workspace.appendingPathComponent("release.zip")
            try fm.moveItem(at: archive, to: zipFile)
            let expanded = workspace.appendingPathComponent("expanded", isDirectory: true)
            try fm.createDirectory(at: expanded, withIntermediateDirectories: true)
            try run("/usr/bin/ditto", ["-x", "-k", zipFile.path, expanded.path])

            let app = expanded.appendingPathComponent("LabelDesk.app", isDirectory: true)
            guard let bundle = Bundle(url: app),
                  bundle.bundleIdentifier == expectedBundleID,
                  (bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) == expectedVersion,
                  let executable = bundle.executableURL else {
                throw UpdateError.invalidBundle
            }
            try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path])
            try run("/usr/bin/lipo", ["-verify_arch", "x86_64", executable.path])
            return (workspace, app)
        } catch {
            try? fm.removeItem(at: workspace)
            throw error
        }
    }

    nonisolated private static func run(_ command: String, _ args: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: command)
        process.arguments = args
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw UpdateError.commandFailed(URL(fileURLWithPath: command).lastPathComponent)
        }
    }

    nonisolated private static func verifyDigest(file: URL, expected: String?) throws {
        guard let expected, expected.hasPrefix("sha256:"),
              expected.count == 71 else { throw UpdateError.checksumMissing }
        let expectedHex = String(expected.dropFirst("sha256:".count)).lowercased()
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
            let chunk = try handle.read(upToCount: 1024 * 1024) ?? Data()
            if chunk.isEmpty { break }
            hasher.update(data: chunk)
        }
        let actualHex = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        guard actualHex == expectedHex else { throw UpdateError.checksumMismatch }
    }

    private func inform(_ message: String) {
        infoMessage = message
        showInfo = true
    }
}
