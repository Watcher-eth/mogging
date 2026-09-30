import AppKit
// Native SF Symbols used by the mobile Protocol screen.
let symbols: [(String, String)] = [
  ("figure.stand", "32c48d"), ("figure.strengthtraining.traditional", "26b86b"),
  ("drop.fill", "48c7ff"), ("sun.max.fill", "f5b73f"),
  ("drop.degreesign.fill", "2eafff"), ("nose.fill", "00a8ef"),
  ("eye.fill", "8c7cff"), ("scissors", "111113"),
  ("mouth.fill", "ff6f9f"), ("sparkles", "ef5da8"),
  ("gearshape", "070709"), ("checkmark.seal.fill", "ffffff"),
  ("bolt", "8a8a93"), ("trophy", "8a8a93"),
  ("circle.grid.2x2.topleft.checkmark.filled", "111111"), ("doc.text", "8a8a93")
]
for (name, hex) in symbols {
  let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 96, pixelsHigh: 96, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  guard let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 64, weight: .regular)) else { fatalError("Missing symbol: \(name)") }
  let size = image.size
  let scale = min(88 / size.width, 88 / size.height)
  image.draw(in: NSRect(x: (96 - size.width * scale) / 2, y: (96 - size.height * scale) / 2, width: size.width * scale, height: size.height * scale))
  let value = UInt32(hex, radix: 16)!
  NSColor(calibratedRed: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1).setFill()
  NSRect(x: 0, y: 0, width: 96, height: 96).fill(using: .sourceAtop)
  NSGraphicsContext.restoreGraphicsState()
  try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(CommandLine.arguments[1])/\(name).png"))
}
print("Exported \(symbols.count) native protocol symbols")
