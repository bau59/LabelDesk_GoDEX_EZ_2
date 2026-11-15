import Foundation

enum FlowControl: String, Codable, CaseIterable, Identifiable {
    case none = "None", xonXoff = "XON/XOFF", rtsCts = "RTS/CTS"
    var id: String { rawValue }
}

enum EZ2PrintSpeed: Int, Codable, CaseIterable, Identifiable {
    case slow = 0
    case normal = 1
    var id: Int { rawValue }
    var title: String { self == .slow ? "1 inch/s (25.4 mm/s)" : "2 inches/s (50.8 mm/s)" }
}

/// The old printer has very little input buffering. Long graphic packets
/// can overrun it even when USB-RS232 accepted the whole write.
enum EZ2RasterTransport: String, Codable, CaseIterable, Identifiable {
    case paced, legacy
    var id: String { rawValue }
    var title: String {
        switch self {
        case .paced: "Совместимость EZ-2 — блоками по 64 байта"
        case .legacy: "Старый режим — непрерывная передача"
        }
    }
}

enum EZ2SensorMode: String, Codable, CaseIterable, Identifiable {
    case unchanged, gap, blackMark
    var id: String { rawValue }
    var title: String {
        switch self {
        case .unchanged: "Keep printer sensor mode"
        case .gap: "Label gap (transmissive, F0)"
        case .blackMark: "Black mark (reflective, F1)"
        }
    }
}

struct PrinterProfile: Codable, Equatable {
    var portPath = ""
    var baudRate = 9600
    var flowControl: FlowControl = .none
    var density = 5
    var printSpeed: EZ2PrintSpeed = .normal
    var rasterTransport: EZ2RasterTransport = .paced
    var automaticTopOfForm = true
    var rasterThreshold = 128
    var sensorMode: EZ2SensorMode = .unchanged
    var topOfFormDots = 176
    var leftMarginMM: Double = 18
    var topOffsetDots = 0
    var xOffsetMM: Double = 0
    var yOffsetMM: Double = 0
    var materialGapMM: Double = 3

    init() {}

    // Preserve users' saved 0.1–0.5 profiles when new settings are introduced.
    // Synthesized Decodable would throw on missing new keys and discard settings.
    enum CodingKeys: String, CodingKey {
        case portPath, baudRate, flowControl, density, printSpeed, rasterThreshold
        case rasterTransport, automaticTopOfForm
        case sensorMode, topOfFormDots, leftMarginMM, topOffsetDots
        case xOffsetMM, yOffsetMM, materialGapMM
    }

    init(from decoder: Decoder) throws {
        let keys = try decoder.container(keyedBy: CodingKeys.self)
        portPath = try keys.decodeIfPresent(String.self, forKey: .portPath) ?? ""
        baudRate = try keys.decodeIfPresent(Int.self, forKey: .baudRate) ?? 9600
        flowControl = try keys.decodeIfPresent(FlowControl.self, forKey: .flowControl) ?? .none
        density = min(7, max(0, try keys.decodeIfPresent(Int.self, forKey: .density) ?? 5))
        printSpeed = try keys.decodeIfPresent(EZ2PrintSpeed.self, forKey: .printSpeed) ?? .normal
        rasterTransport = try keys.decodeIfPresent(EZ2RasterTransport.self, forKey: .rasterTransport) ?? .paced
        automaticTopOfForm = try keys.decodeIfPresent(Bool.self, forKey: .automaticTopOfForm) ?? true
        rasterThreshold = min(192, max(64, try keys.decodeIfPresent(Int.self, forKey: .rasterThreshold) ?? 128))
        sensorMode = try keys.decodeIfPresent(EZ2SensorMode.self, forKey: .sensorMode) ?? .unchanged
        topOfFormDots = min(999, max(4, try keys.decodeIfPresent(Int.self, forKey: .topOfFormDots) ?? 176))
        leftMarginMM = try keys.decodeIfPresent(Double.self, forKey: .leftMarginMM) ?? 18
        topOffsetDots = try keys.decodeIfPresent(Int.self, forKey: .topOffsetDots) ?? 0
        xOffsetMM = try keys.decodeIfPresent(Double.self, forKey: .xOffsetMM) ?? 0
        yOffsetMM = try keys.decodeIfPresent(Double.self, forKey: .yOffsetMM) ?? 0
        materialGapMM = try keys.decodeIfPresent(Double.self, forKey: .materialGapMM) ?? 3
    }
}

struct AppSettings: Codable {
    var schemaVersion = 1
    var profile = PrinterProfile()
    var snapToGrid = true
}
