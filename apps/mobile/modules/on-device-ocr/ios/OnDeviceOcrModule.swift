import ExpoModulesCore
import UIKit
import Vision

/// Text on a photo, read on the phone by Apple Vision — no network. Returns each recognized line
/// with its box (fractions of the image, origin top-left), so the app can rebuild the rows of a
/// receipt: Vision reports "SUMME EUR" and the "3,50" on the far right as separate observations.
public class OnDeviceOcrModule: Module {
  /// The app's languages; Vision reads each listed one it supports on this iOS version
  /// (Ukrainian from iOS 16).
  private static let wantedLanguages = ["de-DE", "en-US", "pl-PL", "uk-UA"]

  public func definition() -> ModuleDefinition {
    Name("OnDeviceOcr")

    Constants(["isSupported": true])

    AsyncFunction("recognize") { (url: URL, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let data = try Data(contentsOf: url)
          guard let image = UIImage(data: data), let cgImage = image.cgImage else {
            promise.reject("ERR_OCR_IMAGE", "The photo couldn't be read")
            return
          }
          let request = VNRecognizeTextRequest()
          request.recognitionLevel = .accurate
          request.usesLanguageCorrection = true
          if let supported = try? request.supportedRecognitionLanguages() {
            let languages = Self.wantedLanguages.filter { supported.contains($0) }
            if !languages.isEmpty { request.recognitionLanguages = languages }
          }
          let handler = VNImageRequestHandler(cgImage: cgImage, orientation: Self.orientation(of: image), options: [:])
          try handler.perform([request])
          let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
            guard let best = observation.topCandidates(1).first else { return nil }
            // Vision's boxes are normalized with the origin bottom-left.
            let box = observation.boundingBox
            return [
              "text": best.string,
              "x": Double(box.minX),
              "y": Double(1 - box.maxY),
              "width": Double(box.width),
              "height": Double(box.height),
              "confidence": Double(best.confidence),
            ]
          }
          promise.resolve(lines)
        } catch {
          promise.reject("ERR_OCR", error.localizedDescription)
        }
      }
    }
  }

  private static func orientation(of image: UIImage) -> CGImagePropertyOrientation {
    switch image.imageOrientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
