import { IMAGE_TYPES } from "../../shared/images";

const MAX_SIDE = 1024;
const QUALITY = 0.85;

export function isSupportedImage(file: Blob) {
  return file.type in IMAGE_TYPES || /^image\/(heic|heif|avif|bmp)$/.test(file.type);
}

/**
 * Scales a photo down to at most 1024px on its longest side and re-encodes it (WebP, or JPEG where WebP encoding isn't
 * available). Re-encoding also strips camera metadata such as GPS location.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("Could not encode image");
  return jpeg;
}
