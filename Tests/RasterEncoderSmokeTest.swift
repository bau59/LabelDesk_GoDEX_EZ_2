import AppKit
import Foundation

@main
struct RasterEncoderSmokeTest {
    static func main() throws {
        let encoder = GodexEZ2Encoder()
        let profile = PrinterProfile()

        let start = [UInt8](encoder.startupCommands())
        assert(start == [
            0x1B, 0x46, 0x30,
            0x1B, 0x71, 0x30, 0x34, 0x30,
            0x1B, 0x4D, 0x30, 0x31,
            0x1B, 0x42,
            0x1B, 0x41, 0x31, 0x31,
            0x54, 0x33, 0x0D,
            0x1B, 0x45,
            0x1B, 0x50, 0x30, 0x31
        ], "Buffered startup packet must match the physically verified T3")

        var document = LabelDocument()
        assert(document.widthMM == 58 && document.heightMM == 38 && document.gapMM == 2)
        document.elements = [
            LabelElement(kind: .rectangle, xMM: 1, yMM: 1,
                         widthMM: 52, heightMM: 32, value: ""),
            LabelElement(kind: .text, xMM: 2, yMM: 3,
                         widthMM: 20, heightMM: 8, value: "Привет",
                         fontSize: 12)
        ]

        let raster = try LabelRasterizer().rasterize(document, profile: profile)
        assert(raster.widthDots == 440 && raster.heightDots == 304)
        assert(raster.bytesPerLine == 55)

        let packet = [UInt8](try encoder.nativeCommands(for: document, profile: profile))
        assert(packet.count == 280 * 59 + 1)
        assert(packet.last == 0x0C)
        for y in 0..<280 {
            let begin = y * 59
            assert(Array(packet[begin..<(begin + 4)]) == [0x1B, 0x47, 0x35, 0x35])
            let sourceBegin = y * raster.bytesPerLine
            assert(Array(packet[(begin + 4)..<(begin + 59)]) ==
                   Array(raster.rows[sourceBegin..<(sourceBegin + 55)]),
                   "Every row uses fixed-width G55 without trailing-byte trimming")
        }

        // A smaller document is padded with white rows to 280.
        var smaller = document
        smaller.heightMM = 20
        smaller.elements = []
        let smallPacket = [UInt8](try encoder.nativeCommands(for: smaller, profile: profile))
        assert(smallPacket.count == packet.count)
        assert(smallPacket.dropLast().enumerated().allSatisfy { index, byte in
            index % 59 < 4 || byte == 0
        })

        // Overflow below 35mm must fail, not silently disappear.
        var overflow = document
        overflow.elements = [
            LabelElement(kind: .rectangle, xMM: 2, yMM: 36,
                         widthMM: 10, heightMM: 1, value: "")
        ]
        do {
            _ = try encoder.nativeCommands(for: overflow, profile: profile)
            fatalError("Ink below 35mm must be rejected")
        } catch EZ2EncodingError.contentBeyondTestedHeight {}

        // Old settings remain readable; obsolete Q, pacing and X/Y have no effect.
        let legacy = #"{"portPath":"/dev/cu.usbserial-1430","baudRate":9600,"flowControl":"None","rasterTransport":"paced","leftMarginMM":18,"topOfFormDots":176}"#
        let decoded = try JSONDecoder().decode(PrinterProfile.self, from: Data(legacy.utf8))
        assert(decoded.portPath == "/dev/cu.usbserial-1430")
        assert(decoded.labelIntervalSeconds == 1.5 && decoded.rasterThreshold == 128)

        var intervalProfile = decoded
        intervalProfile.labelIntervalSeconds = 0.8
        let saved = try JSONDecoder().decode(PrinterProfile.self,
                                             from: JSONEncoder().encode(intervalProfile))
        assert(saved.labelIntervalSeconds == 0.8)

        print("EZ-2 verified startup, G55×280+FF and settings migration passed.")
    }
}
