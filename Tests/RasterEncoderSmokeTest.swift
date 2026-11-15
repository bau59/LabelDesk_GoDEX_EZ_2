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
            0x1B, 0x51, 0x31, 0x34, 0x34, // Q144 for 30 mm
            0x1B, 0x71, 0x30, 0x33, 0x33, // q033 for height + gap
            0x1B, 0x53, 0x32, // S2 (2 ips)
            0x1B, 0x44, 0x35,
            0x1B, 0x4D, 0x30, 0x31
        ]
        assert(Array(packet.prefix(header.count)) == header)
        var offset = header.count
        for row in 0..<raster.heightDots {
            assert(packet[offset] == 0x1B && packet[offset + 1] == 0x47,
                   "Row \(row) must begin with ESC G")
            let countString = String(decoding: packet[(offset + 2)..<(offset + 4)], as: UTF8.self)
            let count = Int(countString) ?? 0
            assert((1...55).contains(count))
            offset += 4
            let fullRow = Array(raster.rows[(row * 55)..<((row + 1) * 55)])
            assert(Array(packet[offset..<(offset + count)]) == Array(fullRow.prefix(count)),
                   "Raster data mismatch at row \(row)")
            assert(fullRow.dropFirst(count).allSatisfy { $0 == 0 },
                   "Trimming must only remove trailing white bytes")
            offset += count
        }
        assert(packet.count == offset + 1 && packet.last == 0x0C)
        // All-white image must not send 55 bytes per row at 9600 baud.
        var blank = document
        blank.elements = []
        let compact = try encoder.nativeCommands(for: blank, profile: profile)
        assert(compact.count < 1500, "Blank 55x30mm label should use G01 rows")

        // Legacy settings from 0.5 must migrate without losing their port.
        let legacy = #"{"portPath":"/dev/cu.usbserial-1430","baudRate":9600,"flowControl":"None","density":6,"leftMarginMM":18,"topOffsetDots":0,"xOffsetMM":1,"yOffsetMM":0,"materialGapMM":3}"#
        let migrated = try JSONDecoder().decode(PrinterProfile.self, from: Data(legacy.utf8))
        assert(migrated.portPath == "/dev/cu.usbserial-1430")
        assert(migrated.density == 6 && migrated.printSpeed == .normal)
        assert(migrated.topOfFormDots == 176 && migrated.rasterThreshold == 128)
        assert(migrated.automaticTopOfForm && migrated.rasterTransport == .paced)
        assert(migrated.sensorMode == .unchanged)

        var tuned = profile
        tuned.printSpeed = .slow
        tuned.density = 7
        tuned.sensorMode = .gap
        tuned.topOfFormDots = 144
        tuned.automaticTopOfForm = false
        let tunedPacket = [UInt8](try encoder.nativeCommands(for: document, profile: tuned))
        let tunedHeader: [UInt8] = [
            0x1B, 0x51, 0x31, 0x34, 0x34, // Q144
            0x1B, 0x71, 0x30, 0x33, 0x33, // q033
            0x1B, 0x53, 0x31,             // S1 (1 ips)
            0x1B, 0x46, 0x30,             // F0 transmissive
            0x1B, 0x44, 0x37,             // D7
            0x1B, 0x4D, 0x30, 0x31        // M01
        ]
        assert(Array(tunedPacket.prefix(tunedHeader.count)) == tunedHeader)

        // Original 2002 EZ-2 label-paper Q lookup, not modern EZPL.
        assert(GodexEZ2Encoder.labelStopQ(heightMM: 26) == 176)
        assert(GodexEZ2Encoder.labelStopQ(heightMM: 30) == 144)
        assert(GodexEZ2Encoder.labelStopQ(heightMM: 40) == 64)
        assert(GodexEZ2Encoder.labelStopQ(heightMM: 50) == 384)
        assert(GodexEZ2Encoder.effectiveQ(for: document, profile: profile) == 144)

        var manualProfile = profile
        manualProfile.automaticTopOfForm = false
        manualProfile.topOfFormDots = 200
        assert(GodexEZ2Encoder.effectiveQ(for: document, profile: manualProfile) == 200)
        // Legacy user preferences remain readable; manually chosen Q is honored.
        let manualData = [UInt8](try encoder.nativeCommands(for: document, profile: manualProfile))
        assert(Array(manualData.prefix(5)) == [0x1B, 0x51, 0x32, 0x30, 0x30])

        // A minimal 40-mm document must use Q064, not the previously
        // hardcoded 26-mm Q176; short verified TEST remains unchanged.
        var forty = document
        forty.heightMM = 40
        let fortyPacket = [UInt8](try encoder.nativeCommands(for: forty, profile: profile))
        assert(Array(fortyPacket.prefix(5)) == [0x1B, 0x51, 0x30, 0x36, 0x34])

        let fontPacket = encoder.nativeFontProbe(profile: profile)
        assert(fontPacket.range(of: Data([0x1B, 0x41, 0x30, 0x30])) != nil, "Small ASCII font")
        assert(fontPacket.range(of: Data([0x1B, 0x41, 0x31, 0x31])) != nil, "Large ASCII font")
        assert(fontPacket.last == 0x0C)

        var oversized = document
        oversized.widthMM = 56
        do {
            try LabelRasterizer.validate(oversized)
            fatalError("56mm raster must be rejected")
        } catch LabelRenderError.invalidSize {
            // Expected: 56mm head width is not 55-byte ESC G width.
        }

        // A long variable field must produce more than one raster text line,
        // including unbroken words, while never painting outside its box.
        var wrappedDoc = LabelDocument()
        wrappedDoc.widthMM = 40
        wrappedDoc.heightMM = 30
        var longText = LabelElement.text()
        longText.xMM = 3
        longText.yMM = 2
        longText.widthMM = 9
        longText.heightMM = 20
        longText.fontSize = 5
        longText.value = "WWWWWWWWWWWWWWWWWWWWWW"
        wrappedDoc.elements = [longText]
        let wrapped = try LabelRasterizer().rasterize(wrappedDoc, profile: profile)
        func inkPixels(_ raster: LabelRaster) -> [(Int, Int)] {
            var points: [(Int, Int)] = []
            for y in 0..<raster.heightDots {
                for x in 0..<raster.widthDots {
                    let byte = raster.rows[y * raster.bytesPerLine + x / 8]
                    if (byte & UInt8(0x80 >> (x % 8))) != 0 { points.append((x, y)) }
                }
            }
            return points
        }
        let wrappedInk = inkPixels(wrapped)
        assert(!wrappedInk.isEmpty)
        assert(wrappedInk.map { $0.1 }.max()! - wrappedInk.map { $0.1 }.min()! > 27,
               "Long unbroken variable field must wrap into multiple lines")
        assert(wrappedInk.allSatisfy { (24...96).contains($0.0) && (16...176).contains($0.1) },
               "Text must be clipped within original field bounds")

        // No new mandatory JSON keys: older saved text layers stay left-aligned.
        var legacyElement = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(longText)) as! [String: Any]
        legacyElement.removeValue(forKey: "textAlignment")
        let oldElement = try JSONDecoder().decode(
            LabelElement.self, from: JSONSerialization.data(withJSONObject: legacyElement))
        assert(oldElement.effectiveTextAlignment == .left)

        var centered = longText
        centered.value = "X"
        centered.widthMM = 25
        centered.heightMM = 9
        centered.fontSize = 8
        var leftDoc = wrappedDoc
        leftDoc.elements = [centered]
        let leftInk = inkPixels(try LabelRasterizer().rasterize(leftDoc, profile: profile))
        centered.textAlignment = .center
        leftDoc.elements = [centered]
        let centeredInk = inkPixels(try LabelRasterizer().rasterize(leftDoc, profile: profile))
        assert(!leftInk.isEmpty && !centeredInk.isEmpty)
        assert(centeredInk.map { $0.0 }.min()! > leftInk.map { $0.0 }.min()! + 55,
               "Center alignment must change the physical raster, not only HTML preview")

        // A calibration target must not modify any saved document or exceed
        // the thermal head; it is printed once via the normal raster pipeline.
        let sourceID = document.id
        let target = EZ2CalibrationPattern.make(for: document)
        assert(target.id != sourceID && document.id == sourceID)
        assert(target.elements.count >= 10, "Calibration target must include horizontal 5mm ruler marks")
        try LabelRasterizer.validate(target)
        // A 60-mm label is a valid physical medium, but outgoing ESC G rows
        // must never exceed the original EZ-2 protocol limit of 55 bytes.
        var wide = document
        wide.widthMM = 60
        try LabelRasterizer.validate(wide)
        let wideRaster = try LabelRasterizer().rasterize(wide, profile: profile)
        assert(wide.printableWidthMM == 55)
        assert(wide.unprintableRightMM == 5)
        assert(wideRaster.widthDots == 440 && wideRaster.bytesPerLine == 55)
        let widePacket = [UInt8](try encoder.nativeCommands(for: wide, profile: profile))
        var wideOffset = header.count
        for row in 0..<wideRaster.heightDots {
            assert(widePacket[wideOffset] == 0x1B && widePacket[wideOffset + 1] == 0x47)
            let n = Int(String(decoding: widePacket[(wideOffset+2)..<(wideOffset+4)], as: UTF8.self))!
            assert((1...55).contains(n), "Never send undocumented ESC G56")
            wideOffset += 4 + n
        }
        var invalidWidth = wide
        invalidWidth.widthMM = 61
        do {
            try LabelRasterizer.validate(invalidWidth)
            fatalError("Media width > 60mm should be rejected")
        } catch LabelRenderError.invalidSize {}

        let wideCalibration = EZ2CalibrationPattern.make(for: wide)
        try LabelRasterizer.validate(wideCalibration)
        assert(wideCalibration.elements.allSatisfy { $0.xMM + $0.widthMM <= 55.001 })
        assert(wideCalibration.elements.count > target.elements.count,
               "60mm media uses the 55mm full-width ruler for test")
        let targetPacket = try encoder.nativeCommands(for: target, profile: profile)
        assert(targetPacket.last == 0x0C)
        print("EZ-2 raster, long-word wrap, text alignment, calibration target, Q/S and legacy compatibility passed.")
    }
}
