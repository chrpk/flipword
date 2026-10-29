/** Photo formats accepted for cards, with the file extension used for storage. */
export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Upload limit. The browser resizes photos before upload, so real uploads are far smaller. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Total photo storage per user: about 2,000 photos as the browser prepares them (≤1024px WebP). */
export const PHOTO_STORAGE_BYTES = 200 * 1024 * 1024;

export const imageUrl = (key: string) => `/api/images/${key.split("/").map(encodeURIComponent).join("/")}`;
