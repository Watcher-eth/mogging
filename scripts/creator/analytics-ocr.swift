import Foundation
import Vision
import ImageIO

// Local benchmark reader. Coordinates use a top-left origin, normalized to 0...1.
var frames: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path))
    try handler.perform([request])
    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return ["text": candidate.string, "confidence": candidate.confidence,
                "x": box.minX, "y": 1 - box.maxY, "width": box.width, "height": box.height]
    }
    frames.append(["path": path, "lines": lines])
}
let data = try JSONSerialization.data(withJSONObject: frames, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
