import { requireOptionalNativeModule } from "expo";

import type { OcrLine } from "./rows";

export type { OcrLine } from "./rows";

interface NativeOnDeviceOcr {
  isSupported: boolean;
  recognize(uri: string): Promise<OcrLine[]>;
}

// Optional: absent in Expo Go and on web, where the app falls back to the server's OCR.
const native = requireOptionalNativeModule<NativeOnDeviceOcr>("OnDeviceOcr");

export const isOnDeviceOcrAvailable = Boolean(native?.isSupported);

/** Reads the text on a local photo (file:// URI) on the phone itself. */
export function recognizeText(uri: string): Promise<OcrLine[]> {
  if (!native) return Promise.reject(new Error("On-device text recognition isn't available in this build"));
  return native.recognize(uri);
}

export { linesToText } from "./rows";
