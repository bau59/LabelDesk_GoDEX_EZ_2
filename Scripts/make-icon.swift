import AppKit
import Foundation

// Deterministic vector app icon. Rendered during the Intel package build;
// no network assets, external fonts, or runtime dependencies.
guard CommandLine.arguments.count == 2 else {
    fputs("Usage: make-icon output.png\n", stderr)
    exit(2)
}
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)

func color(_ r: CGFloat,_ g: CGFloat,_ b: CGFloat,_ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r / 255, green: g / 255, blue: b / 255, alpha: a)
}
func panel(_ x: CGFloat,_ y: CGFloat,_ w: CGFloat,_ h: CGFloat,_ radius: CGFloat,
           _ paint: NSColor) {
    paint.setFill()
    NSBezierPath(roundedRect: NSRect(x:x,y:y,width:w,height:h),
                 xRadius:radius,yRadius:radius).fill()
}
func stroke(_ x: CGFloat,_ y: CGFloat,_ w: CGFloat,_ h: CGFloat,_ radius: CGFloat,
            _ paint: NSColor,_ line: CGFloat=3) {
    let p=NSBezierPath(roundedRect:NSRect(x:x,y:y,width:w,height:h),
                       xRadius:radius,yRadius:radius)
    p.lineWidth=line
    paint.setStroke()
    p.stroke()
}
image.lockFocus()
NSGraphicsContext.current?.imageInterpolation = .high
let base=NSBezierPath(roundedRect:NSRect(x:42,y:42,width:940,height:940),
                      xRadius:200,yRadius:200)
NSGradient(starting: color(42,57,78), ending: color(8,15,30))?.draw(in:base,angle:130)
stroke(42,42,940,940,200,color(104,120,149,0.55),5)

// Printer body and dark top. Broad shapes remain legible at Dock size.
panel(192,276,640,510,150,color(204,212,224))
panel(211,291,602,465,132,color(241,245,250))
stroke(211,291,602,465,132,color(136,152,175),3)
panel(250,475,525,268,90,color(26,38,57))
panel(268,490,490,235,72,color(35,49,70))
stroke(268,490,490,235,72,color(98,118,146,0.65),3)
panel(300,453,425,54,22,color(7,14,26))
panel(318,462,388,27,12,color(4,9,17))
panel(686,640,64,25,12,color(28,210,198))
panel(693,646,50,12,6,color(93,252,227,0.7))

// A printed label feeding from the slot.
panel(307,164,414,337,46,color(183,193,207))
panel(318,178,390,323,42,color(252,253,255))
stroke(318,178,390,323,42,color(185,197,213),2)
panel(344,419,242,30,13,color(32,45,64))
panel(344,379,260,16,8,color(159,170,188))
panel(344,343,194,14,7,color(182,192,207))
panel(614,385,70,22,10,color(26,191,184))
let bars:[CGFloat]=[19,7,16,7,25,11,18,9,25,7,13,7,22,9,18,13,7,24]
var x:CGFloat=343
for (index,width) in bars.enumerated() {
    if x+width>692 { break }
    panel(x,224,width,index%5 == 0 ? 92 : 78,2,color(30,43,62))
    x+=width+5
}

// Paper curl tip.
let fold=NSBezierPath()
fold.move(to:NSPoint(x:631,y:178))
fold.curve(to:NSPoint(x:713,y:265),
           controlPoint1:NSPoint(x:680,y:181),
           controlPoint2:NSPoint(x:718,y:223))
fold.line(to:NSPoint(x:710,y:202))
fold.curve(to:NSPoint(x:663,y:175),
           controlPoint1:NSPoint(x:691,y:181),
           controlPoint2:NSPoint(x:682,y:178))
fold.close()
color(216,226,238).setFill()
fold.fill()
stroke(42,42,940,940,200,color(252,255,255,0.08),3)
image.unlockFocus()

guard let tiff=image.tiffRepresentation,
      let bitmap=NSBitmapImageRep(data:tiff),
      let png=bitmap.representation(using:.png,properties:[:]) else {
    fputs("Failed to render icon PNG\n",stderr)
    exit(1)
}
try png.write(to:output,options:.atomic)
