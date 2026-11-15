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

    /// An asymmetric 40x40-dot L with a top-right marker to verify bit/row order.
    /// Must be initiated by the user. Does not mark raster output as verified.
    func rasterProbe() -> Data {
        var output: [UInt8] = [
            esc, 0x51, 0x31, 0x37, 0x36,
            esc, 0x53, 0x32,
            esc, 0x44, 0x35,
            esc, 0x4D, 0x31, 0x38
        ]
        for y in 0..<40 {
            output += [esc, 0x47, 0x30, 0x35] // ESC G05: 40 dots
            if y >= 35 {
                output += [255, 255, 255, 255, 255] // L bottom stroke
            } else if y < 5 {
                output += [192, 0, 0, 0, 3] // L left stroke, isolated right marker
            } else {
                output += [192, 0, 0, 0, 0] // L left stroke
            }
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
        bytes.reserveCapacity(raster.heightDots * (raster.bytesPerLine + 4) + 40)

        func command(_ value: String) {
            bytes.append(esc)
            bytes.append(contentsOf: value.utf8)
        }

        // The verified TEST and raster probe both establish label registration
        // with Q176. Omitting Q in full raster jobs caused paper to stop
        // immediately after the last graphic row on the user's EZ-2.
        // This is the measured working stop-position setting for this roll.
        command("Q176")
        command(String(format: "q%03d", totalLength))
        command("S2")
        command("D\(min(7, max(0, profile.density)))")
        // The bitmap is 55 mm maximum, so leave 1 mm of the 56-mm head.
        // Never use the TEST profile's M18 offset for full-width graphics.
        command("M01")

        // ESC Gnn consumes one row even when nn is smaller than the physical
        // image width. Omit *trailing white bytes*; leading white is preserved
        // because it determines horizontal positioning. Blank rows use G01 00.
        // At 9600 8N1 this substantially reduces serial transfer time.
        for y in 0..<raster.heightDots {
            let begin = y * raster.bytesPerLine
            let end = begin + raster.bytesPerLine
            let fullRow = raster.rows[begin..<end]
            let lastInk = fullRow.lastIndex(where: { $0 != 0 })
            let count = max(1, (lastInk.map { $0 - begin + 1 }) ?? 0)
            bytes += [esc, 0x47]
            bytes.append(contentsOf: String(format: "%02d", count).utf8)
            bytes.append(contentsOf: raster.rows[begin..<(begin + count)])
        }
        bytes.append(0x0C) // one form feed after the final raster row
        return Data(bytes)
    }
}
