import { BadRequestException } from "@nestjs/common";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

/** Decodes a `<canvas>`-exported PNG data URL into raw bytes for StorageService — the shared zod schema already checked the prefix, this just strips it. */
export function decodePngDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new BadRequestException("Signature must be a PNG data URL");
  }
  return Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), "base64");
}
