import Foundation

enum LabelElementKind: String, Codable, CaseIterable, Identifiable {
    case text, barcode, line, rectangle
    var id: String { rawValue }
    var title: String {
        switch self {
        case .text: "Text"
        case .barcode: "Code 39"
        case .line: "Line"
        case .rectangle: "Rectangle"
        }
    }
}

struct LabelElement: Codable, Identifiable, Equatable {
    var id = UUID()
    var kind: LabelElementKind
    var xMM: Double
    var yMM: Double
    var widthMM: Double
    var heightMM: Double
    var value: String
    var fontSize: Double = 12
    var rotation: Int = 0
    var showsHumanReadable = true
    var isBold = false
    /// Optional for compatibility with templates saved before 0.7.
    /// Unset text fields are considered variable until the designer marks them static.
    var isVariable: Bool? = true
    var fieldName: String?

    var isValidCode39: Bool {
        !value.isEmpty && value.unicodeScalars.allSatisfy { "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-. $/+%".unicodeScalars.contains($0) }
    }

    static func text() -> LabelElement {
        LabelElement(kind: .text, xMM: 3, yMM: 3, widthMM: 25, heightMM: 6, value: "Text")
    }

    static func barcode() -> LabelElement {
        LabelElement(kind: .barcode, xMM: 3, yMM: 12, widthMM: 30, heightMM: 10, value: "1234")
    }

    static func line() -> LabelElement {
        LabelElement(kind: .line, xMM: 3, yMM: 22, widthMM: 30, heightMM: 0.4, value: "")
    }

    static func rectangle() -> LabelElement {
        LabelElement(kind: .rectangle, xMM: 3, yMM: 3, widthMM: 20, heightMM: 10, value: "")
    }
}
