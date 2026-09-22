import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** A photo taken or picked on the phone, already shrunk and saved where it survives until upload. */
export interface LocalPhoto {
  uri: string;
  name: string;
  type: string;
  width: number;
  height: number;
}

/** Long edge after shrinking: plenty to read a crack or a serial plate, a fraction of a 12 MP
 * original — which matters on a site's one bar of signal and against the 25 MB upload limit. */
const MAX_EDGE = 2560;
const JPEG_QUALITY = 0.8;

/**
 * Photos waiting to upload live in the app's documents directory, not the picker's cache: the OS
 * may clear caches at any time, and a queued photo has to outlast a day offline and an app restart.
 */
function uploadsDir(): Directory {
  const dir = new Directory(Paths.document, "offline-uploads");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export type PhotoSource = "camera" | "library";

export class PhotoPermissionError extends Error {
  constructor(readonly source: PhotoSource) {
    super(`No permission to use the ${source}`);
  }
}

/** Takes (or picks) one photo. Null when the person cancels. */
export async function capturePhoto(source: PhotoSource): Promise<LocalPhoto | null> {
  const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionError(source);

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  const longEdge = Math.max(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (longEdge > MAX_EDGE) {
    context.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });

  const name = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const destination = new File(uploadsDir(), name);
  new File(saved.uri).move(destination);
  return { uri: destination.uri, name, type: "image/jpeg", width: saved.width, height: saved.height };
}

/** Removes a photo's file once uploaded, or when the person discards it. */
export function deletePhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // already gone
  }
}

/** Every file waiting to upload — for when the signed-in account changes (offline-db.ts). */
export function clearQueuedFiles(): void {
  const dir = new Directory(Paths.document, "offline-uploads");
  if (dir.exists) dir.delete();
}
