import Foundation

final class StorageService {
    private let root: URL
    private let templates: URL
    private let settingsURL: URL
    private let queueURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(fileManager: FileManager = .default) {
        root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LabelDesk", isDirectory: true)
        templates = root.appendingPathComponent("templates", isDirectory: true)
        settingsURL = root.appendingPathComponent("settings.json")
        queueURL = root.appendingPathComponent("queue.json")
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        try? fileManager.createDirectory(at: templates, withIntermediateDirectories: true)
    }

    func loadSettings() -> AppSettings { load(AppSettings.self, from: settingsURL) ?? AppSettings() }
    func saveSettings(_ settings: AppSettings) throws { try save(settings, to: settingsURL) }
    func loadQueue() -> [PrintJob] { load([PrintJob].self, from: queueURL) ?? [] }
    func saveQueue(_ queue: [PrintJob]) throws { try save(queue, to: queueURL) }

    func listDocuments() -> [LabelDocument] {
        let urls = (try? FileManager.default.contentsOfDirectory(at: templates, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        return urls.compactMap { load(LabelDocument.self, from: $0) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func saveDocument(_ document: LabelDocument) throws {
        try save(document, to: templates.appendingPathComponent("\(document.id.uuidString).json"))
    }

    private func load<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    private func save<T: Encodable>(_ value: T, to url: URL) throws {
        let data = try encoder.encode(value)
        try data.write(to: url, options: .atomic)
    }
}
