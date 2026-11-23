/** Compress promotional posters in the browser. Authorization and binary verification stay on the backend. */
export const MAX_POSTER_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_POSTER_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_POSTER_WIDTH = 1200;
export const MAX_POSTER_HEIGHT = 1800;
export const POSTER_WEBP_QUALITY = 0.8;
const ALLOWED_POSTER_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type PreparedPoster = { file: File; originalBytes: number; uploadBytes: number; optimized: boolean };

export function validatePosterSource(file: Pick<File, "size" | "type">): void {
  if (!ALLOWED_POSTER_MIME.some((type) => type === file.type)) {
    throw new Error("Choose a JPG, PNG or WebP poster.");
  }
  if (file.size <= 0) throw new Error("The selected poster is empty.");
  if (file.size > MAX_POSTER_SOURCE_BYTES) {
    throw new Error("Choose a source image no larger than 20 MB.");
  }
}

export function posterDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Could not read poster dimensions.");
  }
  const scale = Math.min(1, MAX_POSTER_WIDTH / width, MAX_POSTER_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Use WebP only if smaller; do not upload files exceeding the backend Storage limit. */
export function selectPosterFile(original: File, webp: Blob | null): PreparedPoster {
  const useWebp = Boolean(webp && webp.type === "image/webp" && webp.size > 0 && webp.size < original.size);
  const file = useWebp
    ? new File([webp!], original.name.replace(/\.[^.]+$/, "") + ".webp", {
        type: "image/webp", lastModified: original.lastModified,
      })
    : original;
  if (file.size > MAX_POSTER_UPLOAD_BYTES) {
    throw new Error("Poster is still over 5 MB after optimization. Please choose a smaller image.");
  }
  return { file, originalBytes: original.size, uploadBytes: file.size, optimized: useWebp };
}

/** Browser-only: decode pixels, resize, encode as WebP, and keep whichever file is smaller. */
export async function preparePosterUpload(source: File): Promise<PreparedPoster> {
  validatePosterSource(source);
  let bitmap: ImageBitmap | null = null;
  let fallbackUrl: string | null = null;
  try {
    let drawable: CanvasImageSource;
    let width: number;
    let height: number;
    if (typeof createImageBitmap === "function") {
      // The default imageOrientation handles JPEG EXIF orientation.
      bitmap = await createImageBitmap(source);
      drawable = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      // Older browsers can still decode local files without uploading them.
      fallbackUrl = URL.createObjectURL(source);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("The poster is not a readable image."));
        img.src = fallbackUrl!;
      });
      drawable = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
    }
    const target = posterDimensions(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image optimization is unavailable in this browser.");
    context.drawImage(drawable, 0, 0, target.width, target.height);
    const webp = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", POSTER_WEBP_QUALITY);
    });
    // Browsers lacking WebP encoding return a different MIME type or null.
    return selectPosterFile(source, webp);
  } catch (cause) {
    if (cause instanceof Error && /still over 5 MB/.test(cause.message)) throw cause;
    throw new Error("Could not optimize the poster. Choose a valid JPG, PNG or WebP image.");
  } finally {
    bitmap?.close();
    if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
  }
}

export function posterFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + " KB" : (bytes / (1024 * 1024)).toFixed(2) + " MB";
}
