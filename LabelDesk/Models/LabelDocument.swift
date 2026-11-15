import Foundation

struct LabelDocument: Codable, Identifiable, Equatable {
    var schemaVersion = 1
    var id = UUID()
    var name: String = "Untitled label"
    var widthMM: Double = 40
    var heightMM: Double = 30
    var gapMM: Double = 3
    var elements: [LabelElement] = []
    var updatedAt = Date()

    var printableWidthMM: Double { min(widthMM, 55) }
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
        LabelPreset(widthMM: 50, heightMM: 30), LabelPreset(widthMM: 50, heightMM: 40)
    ]
}
