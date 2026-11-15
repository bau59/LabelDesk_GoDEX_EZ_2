import Foundation

enum EZ2EncodingError: LocalizedError {
    case contentBeyondTestedHeight

    var errorDescription: String? {
        switch self {
        case .contentBeyondTestedHeight:
            return "Рисунок выходит ниже 35 мм. Для EZ-2 проверены 280 строк; перенесите содержимое выше."
        }
    }
}

/// Original EZ-2 ESC commands, checked against the working terminal tests.
struct GodexEZ2Encoder {
    static let rasterBytesPerRow = 55
    static let printableRows = 280

    /// Separate buffered T3 label, used once when a batch starts.
    func startupCommands() -> Data {
        Data([
            0x1B, 0x46, 0x30,              // ESC F0
            0x1B, 0x71, 0x30, 0x34, 0x30,  // ESC q040
            0x1B, 0x4D, 0x30, 0x31,        // ESC M01
            0x1B, 0x42,                    // ESC B
            0x1B, 0x41, 0x31, 0x31,        // ESC A11
            0x54, 0x33, 0x0D,              // T3 + CR
            0x1B, 0x45,                    // ESC E
            0x1B, 0x50, 0x30, 0x31         // ESC P01
        ])
    }

    /// Sent once at the start of the Line Mode port session, before Gnn data.
    /// This is the header present in the successful two-label 280-row Python test.
    func lineModeSetup() -> Data {
        Data([0x1B, 0x46, 0x30, 0x1B, 0x71, 0x30, 0x34, 0x30, 0x1B, 0x4D, 0x30, 0x31])
    }

    /// Each line has the SAME ESC Gnn width. Choose the smallest width containing
    /// all non-white pixels. Send only down to the last ink row, rounded up to
    /// whole millimeters, with a minimum of 32 rows (the tested short-label case).
    /// A 280-row full-width graphic remains byte-for-byte identical to the
    /// successful G55 x 280 + FF terminal test.
    func nativeCommands(for document: LabelDocument, profile: PrinterProfile) throws -> Data {
        let raster = try LabelRasterizer().rasterize(document, profile: profile)
        precondition(raster.bytesPerLine <= Self.rasterBytesPerRow)

        if raster.heightDots > Self.printableRows {
            let remainder = raster.rows[(Self.printableRows * raster.bytesPerLine)...]
            if remainder.contains(where: { $0 != 0 }) {
                throw EZ2EncodingError.contentBeyondTestedHeight
            }
        }

        let limit = min(raster.heightDots, Self.printableRows)
        var lastInkRow = -1
        var lastInkByte = -1
        for y in 0..<limit {
            let base = y * raster.bytesPerLine
            for x in 0..<raster.bytesPerLine where raster.rows[base + x] != 0 {
                lastInkRow = y
                lastInkByte = max(lastInkByte, x)
            }
        }

        // 1 mm = 8 rows, 32 rows and 10 bytes were physically verified for
        // short labels; full-width 280-row forms keep their original format.
        let rowsToSend = min(Self.printableRows, max(32, ((lastInkRow + 8) / 8) * 8))
        let bytesPerRow = min(Self.rasterBytesPerRow, max(10, lastInkByte + 1))
        let widthDigits = Array(String(format: "%02d", bytesPerRow).utf8)

        var data = Data()
        data.reserveCapacity(rowsToSend * (bytesPerRow + 4) + 1)

        for y in 0..<rowsToSend {
            data.append(contentsOf: [0x1B, 0x47])
            data.append(contentsOf: widthDigits)
            if y < raster.heightDots {
                let base = y * raster.bytesPerLine
                data.append(contentsOf: raster.rows[base..<(base + bytesPerRow)])
            } else {
                data.append(contentsOf: repeatElement(UInt8(0), count: bytesPerRow))
            }
        }
        data.append(0x0C)
        return data
    }
}
