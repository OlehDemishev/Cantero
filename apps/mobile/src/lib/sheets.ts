import { Directory, File, Paths } from "expo-file-system";
import { API_URL, getToken } from "./api-client";

/**
 * Drawing sheets kept on the phone so a plan opens in a basement with no signal. Stored by sheet id:
 * a revision is a new sheet row with its own id (DrawingSheetsService.supersede), so a cached file
 * is never stale — a revised sheet is simply a different file.
 */
function sheetsDir(): Directory {
  const dir = new Directory(Paths.document, "sheets");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** A sheet is a PDF or an image (the Plan room takes PDF, JPEG, PNG and WebP). */
const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const fileFor = (sheetId: string, mimeType: string) => new File(sheetsDir(), `${sheetId}.${EXTENSIONS[mimeType] ?? "bin"}`);

export function isSheetDownloaded(sheetId: string, mimeType: string): boolean {
  return fileFor(sheetId, mimeType).exists;
}

/** Downloads the sheet's file unless it's already on the phone. */
export async function downloadSheet(sheetId: string, mimeType: string): Promise<File> {
  const file = fileFor(sheetId, mimeType);
  if (file.exists) return file;
  const token = getToken();
  // Written to a temporary name first, so an interrupted download never looks like a complete sheet.
  const partial = new File(sheetsDir(), `${sheetId}.part`);
  if (partial.exists) partial.delete();
  await File.downloadFileAsync(`${API_URL}/drawing-sheets/${encodeURIComponent(sheetId)}/file`, partial, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    idempotent: true,
  });
  // A refused request (expired session, sheet deleted) still writes its error body to disk.
  if (!looksLike(partial, mimeType)) {
    partial.delete();
    throw new Error("The sheet couldn't be downloaded");
  }
  partial.move(file);
  return file;
}

/** The file's first bytes match its type — not a JSON error body saved under a sheet's name. */
function looksLike(file: File, mimeType: string): boolean {
  const handle = file.open();
  try {
    const b = handle.readBytes(12);
    if (mimeType === "application/pdf") return String.fromCharCode(...b.slice(0, 5)) === "%PDF-";
    if (mimeType === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    if (mimeType === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8;
    if (mimeType === "image/webp") return String.fromCharCode(...b.slice(8, 12)) === "WEBP";
    return b.length > 0 && b[0] !== 0x7b; // not "{"
  } finally {
    handle.close();
  }
}

/** The sheet as base64, for the drawing view (it runs in a web view and takes serializable props). */
export async function sheetBase64(sheetId: string, mimeType: string): Promise<string> {
  const file = await downloadSheet(sheetId, mimeType);
  return file.base64();
}

/** Every downloaded sheet — on account change, like the rest of the offline data. */
export function clearDownloadedSheets(): void {
  const dir = new Directory(Paths.document, "sheets");
  if (dir.exists) dir.delete();
}
