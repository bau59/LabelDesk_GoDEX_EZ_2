import Foundation

enum FlowControl: String, Codable, CaseIterable, Identifiable {
    case none = "None", xonXoff = "XON/XOFF", rtsCts = "RTS/CTS"
    var id: String { rawValue }
}

struct PrinterProfile: Codable, Equatable {
    var portPath = ""
    var baudRate = 9600
    var flowControl: FlowControl = .none
    var density = 5
    var leftMarginMM: Double = 18
    var topOffsetDots = 0
    var xOffsetMM: Double = 0
    var yOffsetMM: Double = 0
    var materialGapMM: Double = 3
}

struct AppSettings: Codable {
    var schemaVersion = 1
    var profile = PrinterProfile()
    var snapToGrid = true
}
