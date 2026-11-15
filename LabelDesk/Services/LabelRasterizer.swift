import AppKit
import Foundation
import CoreGraphics

/// EZ-2 printhead: 203 dpi = 8 dots/mm; ESC G accepts at most 55 bytes (440 dots) per row.
/// The physical head is 56 mm wide, but full-raster printing is limited to 55 mm.
enum EZ2Limits {
    static let dotsPerMM = 8.0
    static let maxRasterBytes = 55
    static let maxRasterWidthMM = 55.0
    static let headWidthMM = 56.0
    static let maxMediaWidthMM = 60.0
    static let maxRasterHeightMM = 100.0
}

enum LabelRenderError: LocalizedError {
    case invalidSize
    case invalidElement(String)
    case invalidBarcode(String)
    case cannotCreateBitmap

    var errorDescription: String? {
        switch self {
        case .invalidSize:
            return "Label must be 10–55 mm wide and 10–100 mm high, with a 0–10 mm gap. Graphics are limited to 55 bytes per line."
        case .invalidElement(let detail):
            return "Item exceeds the printable label area: \(detail)"
        case .invalidBarcode(let detail):
            return "Invalid Code 39 barcode: \(detail)"
        case .cannotCreateBitmap:
            return "Unable to prepare the monochrome label bitmap."
        }
    }
}

struct LabelRaster {
    let widthDots: Int
    let heightDots: Int
    let bytesPerLine: Int
    let rows: [UInt8]
    let image: NSImage
}

struct LabelRasterizer {
    private static let code39: [Character: String] = [
        "0":"nnnwwnwnn", "1":"wnnwnnnnw", "2":"nnwwnnnnw", "3":"wnwwnnnnn",
        "4":"nnnwwnnnw", "5":"wnnwwnnnn", "6":"nnwwwnnnn", "7":"nnnwnnwnw",
        "8":"wnnwnnwnn", "9":"nnwwnnwnn", "A":"wnnnnwnnw", "B":"nnwnnwnnw",
        "C":"wnwnnwnnn", "D":"nnnnwwnnw", "E":"wnnnwwnnn", "F":"nnwnwwnnn",
        "G":"nnnnnwwnw", "H":"wnnnnwwnn", "I":"nnwnnwwnn", "J":"nnnnwwwnn",
        "K":"wnnnnnnww", "L":"nnwnnnnww", "M":"wnwnnnnwn", "N":"nnnnwnnww",
        "O":"wnnnwnnwn", "P":"nnwnwnnwn", "Q":"nnnnnnwww", "R":"wnnnnnwwn",
        "S":"nnwnnnwwn", "T":"nnnnwnwwn", "U":"wwnnnnnnw", "V":"nwwnnnnnw",
        "W":"wwwnnnnnn", "X":"nwnnwnnnw", "Y":"wwnnwnnnn", "Z":"nwwnwnnnn",
        "-":"nwnnnnwnw", ".":"wwnnnnwnn", " ":"nwwnnnwnn", "$":"nwnwnwnnn",
        "/":"nwnwnnnwn", "+":"nwnnnwnwn", "%":"nnnwnwnwn", "*":"nwnnwnwnn"
    ]

    static func validate(_ document: LabelDocument) throws {
        guard document.widthMM.isFinite, document.heightMM.isFinite, document.gapMM.isFinite,
              (10...EZ2Limits.maxRasterWidthMM).contains(document.widthMM),
              (10...EZ2Limits.maxRasterHeightMM).contains(document.heightMM),
              (0...10).contains(document.gapMM),
              document.heightMM + document.gapMM <= 999 else { throw LabelRenderError.invalidSize }

        for item in document.elements {
            guard item.xMM.isFinite, item.yMM.isFinite,
                  item.widthMM.isFinite, item.heightMM.isFinite,
                  item.xMM >= 0, item.yMM >= 0,
                  item.widthMM > 0, item.heightMM > 0,
                  item.xMM + item.widthMM <= document.widthMM + 0.001,
                  item.yMM + item.heightMM <= document.heightMM + 0.001 else {
                throw LabelRenderError.invalidElement(item.kind.title)
            }
            if item.kind == .barcode {
                let data = item.value.uppercased()
                guard !data.isEmpty, data.count <= 40, data.allSatisfy({ code39[$0] != nil && $0 != "*" }) else {
                    throw LabelRenderError.invalidBarcode(item.value)
                }
                let segments = ("*" + data + "*").compactMap { code39[$0] }
                let modules = segments.reduce(0) { sum, pattern in
                    sum + pattern.reduce(0) { $0 + ($1 == "w" ? 3 : 1) }
                } + segments.count - 1
                let widthDots = Int((item.widthMM * EZ2Limits.dotsPerMM).rounded(.down))
                guard widthDots >= modules * 2 else {
                    throw LabelRenderError.invalidBarcode("Increase width to at least \(String(format: "%.1f", Double(modules * 2) / 8.0)) mm or shorten the value.")
                }
            }
        }
    }

    func rasterize(_ document: LabelDocument, profile: PrinterProfile) throws -> LabelRaster {
        try Self.validate(document)
        let width = Int((document.widthMM * EZ2Limits.dotsPerMM).rounded(.up))
        let height = Int((document.heightMM * EZ2Limits.dotsPerMM).rounded(.up))
        let byteWidth = (width + 7) / 8
        guard byteWidth <= EZ2Limits.maxRasterBytes,
              let cg = CGContext(data: nil, width: width, height: height,
                                 bitsPerComponent: 8, bytesPerRow: width * 4,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw LabelRenderError.cannotCreateBitmap
        }

        cg.setFillColor(NSColor.white.cgColor)
        cg.fill(CGRect(x: 0, y: 0, width: width, height: height))
        cg.translateBy(x: 0, y: CGFloat(height))
        cg.scaleBy(x: 1, y: -1)
        cg.setFillColor(NSColor.black.cgColor)
        cg.setStrokeColor(NSColor.black.cgColor)
        cg.interpolationQuality = .none
        let textContext = NSGraphicsContext(cgContext: cg, flipped: true)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = textContext
        defer { NSGraphicsContext.restoreGraphicsState() }

        for item in document.elements {
            let x = CGFloat((item.xMM + profile.xOffsetMM) * EZ2Limits.dotsPerMM)
            let y = CGFloat((item.yMM + profile.yOffsetMM) * EZ2Limits.dotsPerMM)
            let w = CGFloat(item.widthMM * EZ2Limits.dotsPerMM)
            let h = CGFloat(item.heightMM * EZ2Limits.dotsPerMM)
            let rect = CGRect(x: x, y: y, width: w, height: h)
            cg.saveGState()
            switch item.kind {
            case .line:
                cg.fill(rect)
            case .rectangle:
                cg.setLineWidth(2)
                cg.stroke(rect.insetBy(dx: 1, dy: 1))
            case .text:
                let fontPoints = max(5.0, item.fontSize * EZ2Limits.dotsPerMM / 2.8346457)
                let font = item.isBold
                    ? NSFont.boldSystemFont(ofSize: fontPoints)
                    : NSFont.systemFont(ofSize: fontPoints)
                let paragraph = NSMutableParagraphStyle()
                paragraph.lineBreakMode = .byClipping
                if item.rotation != 0 {
                    cg.translateBy(x: x + w / 2, y: y + h / 2)
                    cg.rotate(by: CGFloat(item.rotation) * .pi / 180)
                    let centered = CGRect(x: -w / 2, y: -h / 2, width: w, height: h)
                    (item.value as NSString).draw(in: centered, withAttributes: [
                        .font: font, .foregroundColor: NSColor.black, .paragraphStyle: paragraph
                    ])
                } else {
                    (item.value as NSString).draw(in: rect, withAttributes: [
                        .font: font, .foregroundColor: NSColor.black, .paragraphStyle: paragraph
                    ])
                }
            case .barcode:
                try drawCode39(item, in: rect, context: cg)
            }
            cg.restoreGState()
        }

        guard let image = cg.makeImage(), let raw = cg.data else {
            throw LabelRenderError.cannotCreateBitmap
        }
        let bitmap = raw.assumingMemoryBound(to: UInt8.self)
        let stride = cg.bytesPerRow
        var packed = [UInt8](repeating: 0, count: byteWidth * height)
        for y in 0..<height {
            for x in 0..<width {
                let offset = y * stride + x * 4
                if bitmap[offset] < 128 && bitmap[offset + 1] < 128 && bitmap[offset + 2] < 128 {
                    packed[y * byteWidth + x / 8] |= UInt8(0x80 >> (x % 8))
                }
            }
        }

        return LabelRaster(
            widthDots: width, heightDots: height, bytesPerLine: byteWidth,
            rows: packed, image: NSImage(cgImage: image, size: NSSize(width: width, height: height))
        )
    }

    private func drawCode39(_ item: LabelElement, in rect: CGRect, context: CGContext) throws {
        let data = "*" + item.value.uppercased() + "*"
        let segments = data.compactMap { Self.code39[$0] }
        let units = segments.reduce(0) { sum, code in
            sum + code.reduce(0) { $0 + ($1 == "w" ? 3 : 1) }
        } + segments.count - 1
        let narrow = floor(rect.width / CGFloat(units))
        guard narrow >= 2 else { throw LabelRenderError.invalidBarcode("Not enough horizontal dots.") }

        let textHeight: CGFloat = item.showsHumanReadable ? 16 : 0
        let barHeight = max(4, rect.height - textHeight)
        var cursor = rect.minX
        for (index, code) in segments.enumerated() {
            for (i, char) in code.enumerated() {
                let segmentWidth = narrow * (char == "w" ? 3 : 1)
                if i.isMultiple(of: 2) {
                    context.fill(CGRect(x: cursor, y: rect.minY, width: segmentWidth, height: barHeight))
                }
                cursor += segmentWidth
            }
            if index != segments.count - 1 { cursor += narrow }
        }

        if item.showsHumanReadable {
            let paragraph = NSMutableParagraphStyle()
            paragraph.alignment = .center
            let caption = CGRect(x: rect.minX, y: rect.maxY - textHeight,
                                 width: rect.width, height: textHeight)
            (item.value as NSString).draw(in: caption, withAttributes: [
                .font: NSFont.monospacedSystemFont(ofSize: 13, weight: .regular),
                .foregroundColor: NSColor.black, .paragraphStyle: paragraph
            ])
        }
    }
}
