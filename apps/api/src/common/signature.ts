import { BadRequestException } from "@nestjs/common";
import { contentMatchesType } from "./file-signature";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

/** Decodes a `<canvas>`-exported PNG data URL into raw bytes for StorageService — the shared zod schema
 * already checked the prefix; the bytes have to be a PNG too, since the signature is embedded in PDFs. */
export function decodePngDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new BadRequestException("Signature must be a PNG data URL");
  }
  const bytes = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), "base64");
  if (!contentMatchesType(bytes, "image/png")) throw new BadRequestException("Signature must be a PNG data URL");
  return bytes;
}
