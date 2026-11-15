import Foundation

enum PrintJobState: String, Codable, CaseIterable {
    case pending, sending, sent, failed, cancelled, uncertain
}

struct PrintJob: Codable, Identifiable, Equatable {
    var schemaVersion = 1
    var id = UUID()
    var document: LabelDocument
    var copies: Int
    var addedAt = Date()
    var state: PrintJobState = .pending
    var errorMessage: String?

    var title: String { "\(document.name) × \(copies)" }
}
