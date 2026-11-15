import Foundation

/// Settings used by the physically verified GoDEX EZ-2 RS-232 path.
/// Legacy Q, pacing, sensor, and transport fields are intentionally ignored.
struct PrinterProfile: Codable, Equatable {
    var portPath = ""
    var baudRate = 9600
    var rasterThreshold = 128
    var labelIntervalSeconds: Double = 1.5

    init() {}

    enum CodingKeys: String, CodingKey {
        case portPath, rasterThreshold, labelIntervalSeconds
    }

    init(from decoder: Decoder) throws {
        let keys = try decoder.container(keyedBy: CodingKeys.self)
        portPath = try keys.decodeIfPresent(String.self, forKey: .portPath) ?? ""
        rasterThreshold = min(192, max(64,
            try keys.decodeIfPresent(Int.self, forKey: .rasterThreshold) ?? 128))
        let delay = try keys.decodeIfPresent(Double.self, forKey: .labelIntervalSeconds) ?? 1.5
        labelIntervalSeconds = delay.isFinite ? min(10, max(0.2, delay)) : 1.5
    }
}

struct AppSettings: Codable {
    var schemaVersion = 1
    var profile = PrinterProfile()
    var snapToGrid = true
}
