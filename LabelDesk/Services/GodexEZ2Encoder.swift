import Foundation

enum EZ2EncodingError: LocalizedError {
    case contentBeyondTestedHeight

    var errorDescription: String? {
        switch self {
        case .contentBeyondTestedHeight:
            return "Рисунок выходит ниже 35 мм. Для EZ-2 подтверждена печать 280 строк; переместите содержимое выше."
        }
    }
}

/// Protocol verified on the physical EZ-2 (58×38 mm labels, 2 mm gap).
/// One buffered ASCII startup label, then unbuffered ESC G55 rows + FF.
/// Never mix the startup packet into the same serial write as raster data.
struct GodexEZ2Encoder {
    static let rasterBytesPerRow = 55
    static let printableRows = 280 // 35 mm, verified for two consecutive labels

    func startupCommands() -> Data {
        Data([
            0x1B, 0x46, 0x30,             // ESC F0: gap sensor
            0x1B, 0x71, 0x30, 0x34, 0x30, // ESC q040: physical step 40 mm
            0x1B, 0x4D, 0x30, 0x31,       // ESC M01
            0x1B, 0x42,                   // ESC B: buffered mode
            0x1B, 0x41, 0x31, 0x31,       // ESC A11
            0x54, 0x33, 0x0D,             // "T3" + CR
            0x1B, 0x45,                   // ESC E
            0x1B, 0x50, 0x30, 0x31        // ESC P01: one startup label
        ])
    }

    /// 280 fixed-width rows. Shorter documents are padded with white rows.
    /// Pixels outside the verified 35 mm height are rejected, never silently cut.
    func nativeCommands(for document: LabelDocument, profile: PrinterProfile) throws -> Data {
        let raster = try LabelRasterizer().rasterize(document, profile: profile)
        precondition(raster.bytesPerLine <= Self.rasterBytesPerRow)

        if raster.heightDots > Self.printableRows {
            let remainder = raster.rows[(Self.printableRows * raster.bytesPerLine)...]
            if remainder.contains(where: { $0 != 0 }) {
                throw EZ2EncodingError.contentBeyondTestedHeight
            }
        }

        var data = Data()
        data.reserveCapacity(Self.printableRows * (Self.rasterBytesPerRow + 4) + 1)
        for y in 0..<Self.printableRows {
            data.append(contentsOf: [0x1B, 0x47, 0x35, 0x35]) // ESC G55
            if y < raster.heightDots {
                let offset = y * raster.bytesPerLine
                data.append(contentsOf: raster.rows[offset..<(offset + raster.bytesPerLine)])
                if raster.bytesPerLine < Self.rasterBytesPerRow {
                    data.append(contentsOf: repeatElement(UInt8(0),
                        count: Self.rasterBytesPerRow - raster.bytesPerLine))
                }
            } else {
                data.append(contentsOf: repeatElement(UInt8(0), count: Self.rasterBytesPerRow))
            }
        }
        data.append(0x0C) // FF, after the last image row
        return data
    }
}
