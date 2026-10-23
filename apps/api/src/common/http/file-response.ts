import { StreamableFile } from "@nestjs/common";

/** Types a browser only ever displays, never runs: these keep their real Content-Type. */
const DISPLAY_ONLY_TYPES = new Set(["application/pdf", "image/gif", "image/jpeg", "image/png", "image/webp"]);

/**
 * Wraps a stored upload for sending back. Always `Content-Disposition: attachment`, so opening the
 * URL directly downloads rather than renders it (an <img> or a fetch() into a Blob, which is how the
 * apps use these, ignore the header); anything outside the display-only types (an SVG, HTML, an
 * unexpected stored type) goes out as application/octet-stream. Together with the global nosniff
 * header (security-headers.ts), an uploaded file can't be served as a page that runs in our origin.
 */
export function storedFileResponse(buffer: Buffer, mimeType: string): StreamableFile {
  const type = DISPLAY_ONLY_TYPES.has(mimeType.toLowerCase()) ? mimeType : "application/octet-stream";
  return new StreamableFile(buffer, { type, disposition: "attachment" });
}
