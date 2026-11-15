import AppKit
import Foundation

@main
struct RasterEncoderSmokeTest {
    static func main() throws {
        let encoder = GodexEZ2Encoder()
        let profile = PrinterProfile()

        assert(Array(encoder.startupCommands()) == [
            0x1B, 0x46, 0x30,
            0x1B, 0x71, 0x30, 0x34, 0x30,
            0x1B, 0x4D, 0x30, 0x31,
            0x1B, 0x42,
            0x1B, 0x41, 0x31, 0x31,
            0x54, 0x33, 0x0D,
            0x1B, 0x45,
            0x1B, 0x50, 0x30, 0x31
        ], "T3 startup packet changed")

        assert(Array(encoder.lineModeSetup()) == [
            0x1B, 0x46, 0x30,
            0x1B, 0x71, 0x30, 0x34, 0x30,
            0x1B, 0x4D, 0x30, 0x31
        ], "Line Mode header must match the successful Python batch")

        // One blank-label advance is 40 mm. The original ESC fnn command
        // accepts only 01...29 mm, so split the pitch into two safe feeds.
        assert(Array(encoder.jobTearFeedCommands()) == [
            0x1B, 0x66, 0x32, 0x39, // ESC f29
            0x1B, 0x66, 0x31, 0x31  // ESC f11
        ], "Tear feed must skip exactly one 40mm pitch")


        func checkPacket(_ data: Data, rows expectedRows: Int,
                         width expectedWidth: Int, raster: LabelRaster) {
            let bytes = [UInt8](data)
            let lineSize = expectedWidth + 4
            assert(bytes.count == expectedRows * lineSize + 1)
            assert(bytes.last == 0x0C)
            let widthDigits = Array(String(format: "%02d", expectedWidth).utf8)
            for y in 0..<expectedRows {
                let offset = y * lineSize
                assert(Array(bytes[offset..<(offset + 4)]) ==
                       [0x1B, 0x47] + widthDigits,
                       "Wrong ESC G width on row \(y)")
                let imageRow = y < raster.heightDots
                    ? Array(raster.rows[(y * raster.bytesPerLine)..<(y * raster.bytesPerLine + expectedWidth)])
                    : [UInt8](repeating: 0, count: expectedWidth)
                assert(Array(bytes[(offset + 4)..<(offset + lineSize)]) == imageRow,
                       "Bitmap bytes mismatch on row \(y)")
            }
        }

        var full = LabelDocument()
        assert(full.widthMM == 58 && full.heightMM == 38 && full.gapMM == 2)
        full.elements = [
            LabelElement(kind: .line, xMM: 0, yMM: 0,
                         widthMM: 55, heightMM: 1, value: ""),
            LabelElement(kind: .line, xMM: 0, yMM: 34.5,
                         widthMM: 55, heightMM: 0.5, value: "")
        ]
        let fullRaster = try LabelRasterizer().rasterize(full, profile: profile)
        assert(fullRaster.widthDots == 440 && fullRaster.heightDots == 304)
        checkPacket(try encoder.nativeCommands(for: full, profile: profile),
                    rows: 280, width: 55, raster: fullRaster)

        // Short lines are the empirically tested G10 / 32-row case.
        var small = full
        small.elements = [
            LabelElement(kind: .line, xMM: 0, yMM: 0,
                         widthMM: 5, heightMM: 1, value: "")
        ]
        let smallRaster = try LabelRasterizer().rasterize(small, profile: profile)
        let compact = try encoder.nativeCommands(for: small, profile: profile)
        checkPacket(compact, rows: 32, width: 10, raster: smallRaster)
        assert(compact.count == 449, "Short text must not consume full-label bandwidth")

        // The height and width are uniform within each label, even when
        // individual source rows are white. No per-row Gnn changes.
        var partial = full
        partial.elements = [
            LabelElement(kind: .line, xMM: 8, yMM: 10,
                         widthMM: 10, heightMM: 1, value: "")
        ]
        let partialRaster = try LabelRasterizer().rasterize(partial, profile: profile)
        let partialBytes = try encoder.nativeCommands(for: partial, profile: profile)
        checkPacket(partialBytes, rows: 88, width: 18, raster: partialRaster)

        // White trailing rows are removed; blank labels still send 32 G10 rows + FF.
        var blank = full
        blank.elements = []
        let blankRaster = try LabelRasterizer().rasterize(blank, profile: profile)
        checkPacket(try encoder.nativeCommands(for: blank, profile: profile),
                    rows: 32, width: 10, raster: blankRaster)

        // Never silently truncate anything below the verified 35mm region.
        var overflow = full
        overflow.elements = [
            LabelElement(kind: .rectangle, xMM: 2, yMM: 36,
                         widthMM: 10, heightMM: 1, value: "")
        ]
        do {
            _ = try encoder.nativeCommands(for: overflow, profile: profile)
            fatalError("Ink below 35mm must fail")
        } catch EZ2EncodingError.contentBeyondTestedHeight {}

        let legacy = #"{"portPath":"/dev/cu.usbserial-1430","baudRate":9600,"flowControl":"None","rasterTransport":"paced","leftMarginMM":18,"topOfFormDots":176}"#
        let migrated = try JSONDecoder().decode(PrinterProfile.self, from: Data(legacy.utf8))
        assert(migrated.portPath == "/dev/cu.usbserial-1430")
        assert(migrated.labelIntervalSeconds == 1.5)
        assert(migrated.rasterThreshold == 128)

        var tuned = migrated
        tuned.labelIntervalSeconds = 0.8
        let decoded = try JSONDecoder().decode(PrinterProfile.self,
                                                from: JSONEncoder().encode(tuned))
        assert(decoded.labelIntervalSeconds == 0.8)

        print("EZ-2 startup, Gnn/FF and single 40mm job-end tear feed passed.")
    }
}
