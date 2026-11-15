import AppKit
import Foundation

@main
struct RasterEncoderSmokeTest {
    static func main() throws {
        let encoder = GodexEZ2Encoder()
        let profile = PrinterProfile()

        let verifiedTest: [UInt8] = [
            0x1B, 0x51, 0x31, 0x37, 0x36,
            0x1B, 0x53, 0x32,
            0x1B, 0x44, 0x35,
            0x1B, 0x4D, 0x31, 0x38,
            0x1B, 0x41, 0x31, 0x31,
            0x54, 0x45, 0x53, 0x54, 0x0D, 0x0C
        ]
        assert(Array(encoder.testLabel(profile: profile)) == verifiedTest,
               "The physically verified TEST packet must remain unchanged")

        var document = LabelDocument()
        document.widthMM = 55
        document.heightMM = 30
        document.gapMM = 3
        document.elements = [
            LabelElement(kind: .text, xMM: 2, yMM: 2,
                         widthMM: 25, heightMM: 8, value: "Привет",
                         fontSize: 12),
            LabelElement.barcode(),
            LabelElement(kind: .rectangle, xMM: 1, yMM: 1,
                         widthMM: 53, heightMM: 28, value: "")
        ]

        let raster = try LabelRasterizer().rasterize(document, profile: profile)
        assert(raster.bytesPerLine == 55)
        assert(raster.widthDots == 440)
        assert(raster.heightDots == 240)
        assert(raster.rows.count == 55 * 240)
        assert(raster.rows.contains(where: { $0 != 0 }), "The raster should contain ink")

        let packet = [UInt8](try encoder.nativeCommands(for: document, profile: profile))
        let header: [UInt8] = [
            0x1B, 0x71, 0x30, 0x33, 0x33,
            0x1B, 0x53, 0x32,
            0x1B, 0x44, 0x35,
            0x1B, 0x4D, 0x30, 0x31
        ]
        assert(Array(packet.prefix(header.count)) == header)
        var offset = header.count
        for row in 0..<raster.heightDots {
            assert(Array(packet[offset..<(offset + 4)]) == [0x1B, 0x47, 0x35, 0x35],
                   "Row \(row) must begin with ESC G55")
            offset += 4
            assert(Array(packet[offset..<(offset + 55)]) ==
                   Array(raster.rows[(row * 55)..<((row + 1) * 55)]),
                   "Graphics data mismatch at row \(row)")
            offset += 55
        }
        assert(packet.count == offset + 1 && packet.last == 0x0C)

        var oversized = document
        oversized.widthMM = 56
        do {
            try LabelRasterizer.validate(oversized)
            fatalError("56mm raster must be rejected")
        } catch LabelRenderError.invalidSize {
            // Expected: 56mm head width is not 55-byte ESC G width.
        }

        print("EZ-2 raster smoke tests passed (440×240, Code39, Cyrillic, binary rows).")
    }
}
