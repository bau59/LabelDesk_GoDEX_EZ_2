import Foundation

/// 2002 EZ-2 ESC protocol. Not EZPL, ZPL or TSPL.
struct GodexEZ2Encoder {
    private let esc: UInt8 = 0x1B

    /// Physical-test packet retained byte-for-byte for the existing default profile.
    func testLabel(profile: PrinterProfile) -> Data {
        var bytes: [UInt8] = [
            esc, 0x51, 0x31, 0x37, 0x36,  // ESC Q176
            esc, 0x53, 0x32,             // ESC S2
            esc, 0x44, 0x35              // ESC D5
        ]
        bytes += [esc, 0x4D] + Array("\(Int(profile.leftMarginMM.rounded()))".utf8)
        bytes += [esc, 0x41, 0x31, 0x31] + Array("TEST".utf8) + [0x0D, 0x0C]
        return Data(bytes)
    }

    /// A small 24x24-dot box to verify ESC G's byte order, row advance and positioning.
    /// Must be initiated by the user. Does not mark raster output as verified.
    func rasterProbe() -> Data {
        var output: [UInt8] = [
            esc, 0x51, 0x31, 0x37, 0x36,
            esc, 0x53, 0x32,
            esc, 0x44, 0x35,
            esc, 0x4D, 0x31, 0x38
        ]
        for y in 0..<24 {
            output += [esc, 0x47, 0x30, 0x33]  // ESC G03: 3 data bytes = 24 pixels
            output += (y == 0 || y == 23) ? [255, 255, 255] : [128, 0, 1]
        }
        output.append(0x0C)
        return Data(output)
    }

    /// Each raster row is ESC Gnn, followed by nn raw binary bytes (1=black).
    /// ESC G maximum for EZ-2 is 55 bytes. Q/q are not interchangeable.
    func nativeCommands(for document: LabelDocument, profile: PrinterProfile) throws -> Data {
        let raster = try LabelRasterizer().rasterize(document, profile: profile)
        precondition(raster.bytesPerLine <= EZ2Limits.maxRasterBytes)
        let totalLength = Int((document.heightMM + document.gapMM).rounded())
        var bytes: [UInt8] = []
        bytes.reserveCapacity(raster.heightDots * (raster.bytesPerLine + 4) + 32)

        func command(_ value: String) {
            bytes.append(esc)
            bytes.append(contentsOf: value.utf8)
        }

        command(String(format: "q%03d", totalLength))
        command("S2")
        command("D\(min(7, max(0, profile.density)))")
        // The bitmap is 55 mm maximum, so leave 1 mm of the 56-mm head.
        // Never use the TEST profile's M18 offset for full-width graphics.
        command("M01")

        let prefix: [UInt8] = [esc, 0x47] + Array(String(format: "%02d", raster.bytesPerLine).utf8)
        for y in 0..<raster.heightDots {
            bytes.append(contentsOf: prefix)
            let begin = y * raster.bytesPerLine
            bytes.append(contentsOf: raster.rows[begin..<(begin + raster.bytesPerLine)])
        }
        bytes.append(0x0C) // one form feed after the final raster row
        return Data(bytes)
    }
}
