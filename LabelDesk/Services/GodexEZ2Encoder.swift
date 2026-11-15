import Foundation

enum GodexEncoderError: LocalizedError {
    case unsupportedLayout
    case invalidCode39

    var errorDescription: String? {
        switch self {
        case .unsupportedLayout:
            "Physical layout printing is disabled until the EZ-2 raster command is verified on this printer."
        case .invalidCode39: "Code 39 supports uppercase letters, digits and - . space $ / + %."
        }
    }
}

struct GodexEZ2Encoder {
    private let esc = UInt8(0x1B)

    /// Confirmed by the user's physical test: ESC Q176, ESC S2, ESC D5, ESC M18, ESC A11, TEST, CR, FF.
    func testLabel(profile: PrinterProfile) -> Data {
        var bytes: [UInt8] = [esc, 0x51, 0x31, 0x37, 0x36, esc, 0x53, 0x32, esc, 0x44, 0x35]
        bytes += [esc, 0x4D] + Array("\\(Int(profile.leftMarginMM.rounded()))".utf8)
        bytes += [esc, 0x41, 0x31, 0x31] + Array("TEST".utf8) + [0x0D, 0x0C]
        assert(bytes.starts(with: [0x1B, 0x51, 0x31, 0x37, 0x36, 0x1B, 0x53, 0x32, 0x1B, 0x44, 0x35]), "Verified TEST packet header was changed")
        assert(Array(bytes.suffix(10)) == [0x1B, 0x41, 0x31, 0x31, 0x54, 0x45, 0x53, 0x54, 0x0D, 0x0C], "Verified TEST packet trailer was changed")
        return Data(bytes)
    }

    func nativeCommands(for document: LabelDocument, profile: PrinterProfile) throws -> Data {
        _ = document
        _ = profile
        // shortcut: layout data is not emitted until exact EZ-2 coordinate and raster commands pass a physical test; upgrade after that test.
        throw GodexEncoderError.unsupportedLayout
    }
}
