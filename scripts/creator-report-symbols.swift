import AppKit
let symbols = ["eyes.inverse", "face.smiling", "mouth", "angle", "distribute.horizontal.left", "person.crop.square", "person.badge.clock", "trapezoid.and.line.vertical", "sun.max", "face.dashed", "chart.bar", "square.and.arrow.up", "arrow.up.right", "list.clipboard.fill", "chevron.up", "chevron.down"]
let cell = 96
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: cell * symbols.count, pixelsHigh: cell, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
for (index, name) in symbols.enumerated() {
    guard let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 60, weight: .regular)) else { fatalError("Missing symbol: \(name)") }
    let size = image.size
    let scale = min(80 / size.width, 80 / size.height)
    image.draw(in: NSRect(x: CGFloat(index * cell) + (96 - size.width * scale) / 2, y: (96 - size.height * scale) / 2, width: size.width * scale, height: size.height * scale))
}
NSColor(calibratedRed: 10/255, green: 10/255, blue: 13/255, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: cell * symbols.count, height: cell).fill(using: .sourceAtop)
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print("Exported \(symbols.count) native report symbols")
