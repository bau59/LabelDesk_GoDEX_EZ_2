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

    /// Explicit one-label experiment for the documented 8x10 and 16x26 ASCII fonts.
    /// Never sent automatically and never used for Cyrillic.
    func nativeFontProbe(profile: PrinterProfile) -> Data {
        let esc = UInt8(0x1B)
        var data: [UInt8] = []
        func cmd(_ ascii: String) {
            data.append(esc)
            data.append(contentsOf: ascii.utf8)
        }
        cmd("Q176")
        cmd("D5")
        cmd("I0")
        cmd("M03")
        cmd("A00")
        data += Array("SMALL 8x10".utf8)
        data.append(0x0D)
        cmd("M03")
        cmd("A11")
        data += Array("LARGE 16x26".utf8)
        data.append(0x0D)
        data.append(0x0C)
        return Data(data)
    }

    /// Original EZ-2 manual, label-paper Q table (height excludes the gap).
    /// This is NOT the ESC q command, which receives height + gap in mm.
    static func labelStopQ(heightMM: Int) -> Int {
        let special: [Int: Int] = [
            6:4, 7:48, 8:4, 9:24, 10:64, 11:32, 12:4,
            13:72, 14:48, 15:24, 16:4, 17:112, 18:96, 19:80,
            20:64, 21:48, 22:32, 23:16, 24:4, 25:184,
            26:176, 27:168, 28:160, 29:152, 30:144, 31:136,
            32:128, 33:120, 34:112, 35:104, 36:96, 37:88,
            38:80, 39:72, 40:64, 41:56, 42:48, 43:40,
            44:32, 45:24, 46:16, 47:8, 48:4
        ]
        return special[heightMM] ?? (heightMM >= 49 ? 384 : 4)
    }

    static func effectiveQ(for document: LabelDocument, profile: PrinterProfile) -> Int {
        if profile.automaticTopOfForm {
            return labelStopQ(heightMM: Int(document.heightMM.rounded()))
        }
        return max(4, min(999, profile.topOfFormDots))
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
        command(String(format: "Q%03d", Self.effectiveQ(for: document, profile: profile)))
        command(String(format: "q%03d", totalLength))
        // Original EZ-2 manual: S1 = 1 ips, S2 = 2 ips.
        // Preserve enum 0/1 JSON raw values for existing saved profiles.
        command("S\(profile.printSpeed.rawValue + 1)")
        switch profile.sensorMode {
        case .unchanged: break
        case .gap: command("F0")
        case .blackMark: command("F1")
        }
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


/// A single bounded label used to measure horizontal/vertical print origin
/// and the available width. Deliberately not persisted as a user template.
/// Physical printable-width test. All strokes stay within the documented
/// ESC G 55-byte row limit. On 56–60 mm media the unprinted right edge is
/// intentional and must not be mistaken for a registration failure.
enum EZ2CalibrationVariant: String, CaseIterable, Identifiable {
    case top, bottom, frame
    var id: String { rawValue }
    var label: String {
        switch self {
        case .top: "Контроль начала"
        case .bottom: "Контроль конца"
        case .frame: "Полная рамка"
        }
    }
}

enum EZ2CalibrationPattern {
    /// The legacy FEED text test is deliberately built as a normal raster label
    /// so all diagnostics can share the same serial path and ESC header.
    static func feedText(for source: LabelDocument) -> LabelDocument {
        var sample = source
        sample.elements = [
            LabelElement(kind: .text, xMM: 1, yMM: 1,
                         widthMM: min(15, source.widthMM - 2),
                         heightMM: min(7, source.heightMM - 2),
                         value: "FEED", fontSize: 10)
        ]
        return sample
    }

    static func make(for source: LabelDocument,
                     variant: EZ2CalibrationVariant = .frame) -> LabelDocument {
        var sample = source
        sample.id = UUID()
        sample.name = "CALIBRATION"
        let rasterWidth = min(source.widthMM, EZ2Limits.maxRasterWidthMM)
        // Every diagnostic uses the same full-height raster row count and
        // Q/q/S/M header. Only the INK changes between the three checks.
        if variant != .frame {
            let y = variant == .top ? 2.0 : (source.heightMM - 2.7)
            sample.elements = [
                LabelElement(kind: .line, xMM: 2, yMM: y,
                             widthMM: min(14, rasterWidth - 4),
                             heightMM: 0.6, value: ""),
                LabelElement(kind: .line, xMM: 2, yMM: y,
                             widthMM: 0.6, heightMM: 2, value: "")
            ]
            return sample
        }
        let innerWidth = rasterWidth - 4
        let innerHeight = source.heightMM - 4
        sample.elements = [
            LabelElement(kind: .rectangle, xMM: 2, yMM: 2,
                         widthMM: innerWidth, heightMM: innerHeight, value: ""),
            LabelElement(kind: .line, xMM: 2, yMM: 2,
                         widthMM: min(7, innerWidth), heightMM: 0.6, value: ""),
            LabelElement(kind: .line, xMM: 2, yMM: 2,
                         widthMM: 0.6, heightMM: min(7, innerHeight), value: ""),
            LabelElement(kind: .line, xMM: rasterWidth / 2 - 0.15, yMM: 2,
                         widthMM: 0.3, heightMM: innerHeight, value: ""),
            LabelElement(kind: .line, xMM: 2, yMM: source.heightMM / 2 - 0.15,
                         widthMM: innerWidth, heightMM: 0.3, value: "")
        ]
        // Short guide marks every 5mm: compare their actual spacing and the
        // last visible stroke to determine usable physical printhead coverage.
        for x in stride(from: 5.0, through: rasterWidth - 2, by: 5.0) {
            sample.elements.append(LabelElement(
                kind: .line, xMM: x, yMM: 2, widthMM: 0.3,
                heightMM: min(3, innerHeight), value: ""
            ))
        }
        return sample
    }
}
