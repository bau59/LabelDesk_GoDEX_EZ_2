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
    case checksumMismatch

    var errorDescription: String? {
        switch self {
        case .unexpectedResponse: "Unexpected response from GitHub."
        case .invalidRelease: "GitHub returned an invalid version."
        case .missingInstaller: "The Intel DMG is missing from this release."
        case .checksumMismatch: "The downloaded installer failed SHA-256 verification."
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
            guard let asset = release.assets.first(where: { $0.name == "LabelDesk-\(version).dmg" }),
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

    func downloadInstaller() async {
        guard let asset = selectedAsset, !isDownloading else { return }
        isDownloading = true
        status = "Downloading v\(latestVersion)…"
        defer { isDownloading = false }

        do {
            let (temporaryFile, response) = try await URLSession.shared.download(from: asset.browserDownloadURL)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw UpdateError.unexpectedResponse
            }
            try verifyDigest(file: temporaryFile, expected: asset.digest)

            let manager = FileManager.default
            let downloads = manager.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
            try manager.createDirectory(at: downloads, withIntermediateDirectories: true)
            var destination = downloads.appendingPathComponent(asset.name)
            if manager.fileExists(atPath: destination.path) {
                destination = downloads.appendingPathComponent("LabelDesk-\(latestVersion)-\(UUID().uuidString.prefix(8)).dmg")
            }
            try manager.moveItem(at: temporaryFile, to: destination)
            status = "Installer downloaded"

            if NSWorkspace.shared.open(destination) {
                inform("Installer opened. Drag LabelDesk.app into Applications and replace the old version. Your serial-port preference is preserved.")
            } else {
                inform("Installer saved to \(destination.path). Open it from Finder to install.")
            }
        } catch {
            status = "Download failed"
            inform(error.localizedDescription)
        }
    }

    private func recordCheck() {
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: lastCheckKey)
    }

    private func verifyDigest(file: URL, expected: String?) throws {
        guard let expected, expected.hasPrefix("sha256:") else { return }
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
        guard expectedHex == actualHex else { throw UpdateError.checksumMismatch }
    }

    private func inform(_ message: String) {
        infoMessage = message
        showInfo = true
    }
}
