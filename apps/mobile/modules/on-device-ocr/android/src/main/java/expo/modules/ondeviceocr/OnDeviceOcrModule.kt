package expo.modules.ondeviceocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Text on a photo, read on the phone by ML Kit's bundled model — no network. Each line comes with
 * its box as fractions of the image, origin top-left, matching the iOS module. ML Kit's on-device
 * recognizer reads Latin script (German, English, Polish); Cyrillic isn't among its scripts, so a
 * Ukrainian receipt falls back to the server's OCR when the phone is online.
 */
class OnDeviceOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OnDeviceOcr")

    Constants("isSupported" to true)

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_OCR", "The app isn't ready", null)
        return@AsyncFunction
      }
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject("ERR_OCR_IMAGE", "The photo couldn't be read", e)
        return@AsyncFunction
      }
      val width = image.width.toDouble()
      val height = image.height.toDouble()
      TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        .process(image)
        .addOnSuccessListener { result ->
          val lines = result.textBlocks.flatMap { it.lines }.mapNotNull { line ->
            val box = line.boundingBox ?: return@mapNotNull null
            mapOf(
              "text" to line.text,
              "x" to box.left / width,
              "y" to box.top / height,
              "width" to box.width() / width,
              "height" to box.height() / height,
              "confidence" to (line.confidence?.toDouble() ?: 1.0),
            )
          }
          promise.resolve(lines)
        }
        .addOnFailureListener { e -> promise.reject("ERR_OCR", e.message ?: "Text recognition failed", e) }
    }
  }
}
