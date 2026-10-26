import { BadRequestException } from "@nestjs/common";

/**
 * Checks an upload's first bytes against the type its client declared. The declared type is only a
 * hint the browser derives from the file name (or anything a script sets), so a page renamed to
 * .jpg would otherwise be stored and served as an image. Only types the app accepts somewhere are
 * known here; any other type fails, so a caller's allowlist can't outgrow this check unnoticed.
 */

const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_LOCAL_FILE = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
/** HEIF major brands an iPhone photo (or an HEIC export) carries in its ftyp box. */
const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);
/** Acrobat finds the header anywhere in the first 1 KB, and some generators put bytes before it. */
const PDF_HEADER_WINDOW = 1024;
const TEXT_SNIFF_BYTES = 8192;

const startsWith = (buffer: Buffer, bytes: readonly number[], offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b);
const ascii = (buffer: Buffer, start: number, end: number) => buffer.subarray(start, end).toString("latin1");

/** Plain text: a UTF-16 BOM, or no NUL byte in the first 8 KB (binary formats are full of them). */
function isText(buffer: Buffer): boolean {
  if (startsWith(buffer, [0xff, 0xfe]) || startsWith(buffer, [0xfe, 0xff])) return true;
  return !buffer.subarray(0, TEXT_SNIFF_BYTES).includes(0);
}

const isZip = (buffer: Buffer) => startsWith(buffer, ZIP_LOCAL_FILE) || startsWith(buffer, ZIP_EMPTY);

const SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, PDF_HEADER_WINDOW).includes("%PDF-"),
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (b) => ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a",
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  "image/heic": (b) => ascii(b, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(b, 8, 12)),
  "image/heif": (b) => ascii(b, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(b, 8, 12)),
  "application/msword": (b) => startsWith(b, OLE2),
  // Windows reports a .csv as application/vnd.ms-excel wherever Excel is installed.
  "application/vnd.ms-excel": (b) => startsWith(b, OLE2) || isText(b),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": isZip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": isZip,
  "application/zip": isZip,
  "text/plain": isText,
};

export function contentMatchesType(buffer: Buffer, mimeType: string): boolean {
  const matches = SIGNATURES[mimeType.toLowerCase()];
  return matches ? matches(buffer) : false;
}

/** 400 unless the file's bytes are what its declared type says they are. */
export function assertContentMatchesType(file: { buffer: Buffer; mimetype: string }): void {
  if (!contentMatchesType(file.buffer, file.mimetype)) {
    throw new BadRequestException(`The file's contents don't match its type "${file.mimetype}"`);
  }
}
