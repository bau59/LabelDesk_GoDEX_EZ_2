import Foundation

struct LabelDocument: Codable, Identifiable, Equatable {
    var schemaVersion = 1
    var id = UUID()
    var folderID: UUID?
    var name: String = "Untitled label"
    var widthMM: Double = 58
    var heightMM: Double = 38
    var gapMM: Double = 2
    var elements: [LabelElement] = []
    var updatedAt = Date()

    var printableWidthMM: Double { min(widthMM, 55) }
    var unprintableRightMM: Double { max(0, widthMM - printableWidthMM) }
    var isWithinPrinterWidth: Bool { widthMM <= 55 }
}

struct LabelPreset: Identifiable, Hashable {
    let widthMM: Double
    let heightMM: Double

    var id: String { "\(widthMM)x\(heightMM)" }
    var title: String { "\(Int(widthMM)) × \(Int(heightMM)) mm" }

    static let standard = [
        LabelPreset(widthMM: 30, heightMM: 20), LabelPreset(widthMM: 40, heightMM: 20),
        LabelPreset(widthMM: 40, heightMM: 30), LabelPreset(widthMM: 50, heightMM: 25),
        LabelPreset(widthMM: 50, heightMM: 30), LabelPreset(widthMM: 50, heightMM: 40),
        LabelPreset(widthMM: 55, heightMM: 30), LabelPreset(widthMM: 58, heightMM: 38),
        LabelPreset(widthMM: 56, heightMM: 30), LabelPreset(widthMM: 60, heightMM: 30)
    ]
}


/// Logical, persistent folder. Templates remain stored as individual UUID JSON files.
struct LabelFolder: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var baseTemplateID: UUID
    var createdAt = Date()
}

struct QuickLabelField: Identifiable, Equatable {
    var id: UUID
    var title: String
    var initialValue: String
}

/// Quick print edits ONLY explicitly variable text values. It never modifies
/// geometry, static text, barcodes, source template IDs or saved files.
enum QuickLabelBuilder {
    static func fields(for base: LabelDocument) -> [QuickLabelField] {
        var index = 0
        return base.elements.compactMap { element -> QuickLabelField? in
            guard element.kind == .text, element.isVariable != false else { return nil }
            index += 1
            let title = element.fieldName?.trimmingCharacters(in: .whitespacesAndNewlines)
            return QuickLabelField(
                id: element.id,
                title: (title?.isEmpty == false) ? title! : "Текст \(index)",
                initialValue: element.value
            )
        }
    }

    static func filled(base: LabelDocument, values: [UUID: String]) -> LabelDocument {
        var document = base
        for index in document.elements.indices {
            let element = document.elements[index]
            if element.kind == .text, element.isVariable != false,
               let value = values[element.id] {
                document.elements[index].value = value
            }
        }
        return document
    }
}
