import { BadRequestException } from "@nestjs/common";

/**
 * Upload type checks against the file's own bytes. Multer's `mimetype` is whatever the client put
 * in the multipart header, so an allowlist on it alone keeps out nothing a script can't relabel:
 * these make sure a stored "PDF" or "PNG" really is one before its type is saved and later served
 * (storedFileResponse keeps the real Content-Type for PDFs and images) or handed to a parser.
 */

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
/** Legacy Office (.doc, .xls): an OLE2 compound file. */
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** HEIF brands in the `ftyp` box an iPhone photo (or another HEIC/HEIF image) opens with. */
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
/** How far into a text file to look for NUL bytes. */
const TEXT_PROBE_BYTES = 8192;

function startsWith(buffer: Buffer, bytes: readonly number[], offset = 0): boolean {
  return buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b);
}

function ascii(buffer: Buffer, start: number, end: number): string {
  return buffer.length >= end ? buffer.toString("latin1", start, end) : "";
}

const isPdf = (b: Buffer) => ascii(b, 0, 5) === "%PDF-";
const isPng = (b: Buffer) => startsWith(b, PNG);
const isJpeg = (b: Buffer) => startsWith(b, JPEG);
const isGif = (b: Buffer) => ["GIF87a", "GIF89a"].includes(ascii(b, 0, 6));
const isWebp = (b: Buffer) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
const isHeif = (b: Buffer) => ascii(b, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(b, 8, 12));
/** A ZIP archive — also every OOXML file (.docx, .xlsx). An empty archive starts with PK\5\6. */
const isZip = (b: Buffer) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
const isOle2 = (b: Buffer) => startsWith(b, OLE2);

/** Text in any 8-bit encoding (no NUL bytes), or UTF-16 with its byte-order mark. */
function isText(b: Buffer): boolean {
  if (startsWith(b, [0xff, 0xfe]) || startsWith(b, [0xfe, 0xff])) return true;
  return !b.subarray(0, TEXT_PROBE_BYTES).includes(0);
}

/** An XML document: text whose first non-blank character (after any UTF-8 BOM) is "<". */
export function looksLikeXml(b: Buffer): boolean {
  if (!isText(b)) return false;
  const head = b.subarray(0, 1024).toString("utf-8").replace(/^\uFEFF/, "").trimStart();
  return head.startsWith("<");
}

const CHECKS: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": isPdf,
  "image/png": isPng,
  "image/jpeg": isJpeg,
  "image/gif": isGif,
  "image/webp": isWebp,
  "image/heic": isHeif,
  "image/heif": isHeif,
  "application/zip": isZip,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": isZip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": isZip,
  "application/msword": isOle2,
  // Windows browsers label a .csv with the Excel type when Excel is installed, so text passes too.
  "application/vnd.ms-excel": (b) => isOle2(b) || isText(b),
  "text/plain": isText,
};

/** Whether the bytes are what `mimeType` says. False for a type this module has no check for. */
export function contentMatchesType(buffer: Buffer, mimeType: string): boolean {
  const check = CHECKS[mimeType.toLowerCase()];
  return !!check && buffer.length > 0 && check(buffer);
}

/** Call after the allowlist check: refuses a file whose contents aren't the type it claims. */
export function assertContentMatchesType(file: { buffer: Buffer; mimetype: string }): void {
  if (!contentMatchesType(file.buffer, file.mimetype)) {
    throw new BadRequestException(`The file's contents don't match its type "${file.mimetype}"`);
  }
}
