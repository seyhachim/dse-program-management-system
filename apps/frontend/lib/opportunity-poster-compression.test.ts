import { describe, expect, test } from "bun:test";
import { MAX_POSTER_SOURCE_BYTES, MAX_POSTER_UPLOAD_BYTES, posterDimensions,
  selectPosterFile, validatePosterSource, posterFileSize } from "./opportunity-poster-compression";

const photo = (size: number, type = "image/jpeg") => new File([new Uint8Array(size)], "event.jpg", { type });

describe("Opportunity poster pre-upload optimization", () => {
  test("resizes portrait and landscape images without upscaling", () => {
    expect(posterDimensions(2400, 3600)).toEqual({ width: 1200, height: 1800 });
    expect(posterDimensions(3000, 1000)).toEqual({ width: 1200, height: 400 });
    expect(posterDimensions(600, 900)).toEqual({ width: 600, height: 900 });
    expect(posterDimensions(1080, 1920)).toEqual({ width: 1013, height: 1800 });
    expect(() => posterDimensions(0, 100)).toThrow();
  });
  test("accepts supported images and rejects unknown, empty and too large sources", () => {
    expect(() => validatePosterSource(photo(5000))).not.toThrow();
    expect(() => validatePosterSource(photo(5000, "image/png"))).not.toThrow();
    expect(() => validatePosterSource(photo(5000, "image/webp"))).not.toThrow();
    expect(() => validatePosterSource(photo(0))).toThrow();
    expect(() => validatePosterSource(photo(100, "image/svg+xml"))).toThrow();
    expect(() => validatePosterSource(photo(MAX_POSTER_SOURCE_BYTES + 1))).toThrow();
  });
  test("selects a smaller WebP with the right MIME and file extension", () => {
    const result = selectPosterFile(photo(1000), new Blob([new Uint8Array(300)], { type: "image/webp" }));
    expect(result.optimized).toBe(true);
    expect(result.file.type).toBe("image/webp");
    expect(result.file.name).toBe("event.webp");
    expect(result.originalBytes).toBe(1000);
    expect(result.uploadBytes).toBe(300);
  });
  test("preserves the original when conversion is larger or unsupported", () => {
    const source = photo(1000);
    expect(selectPosterFile(source, new Blob([new Uint8Array(1200)], { type: "image/webp" })).file).toBe(source);
    expect(selectPosterFile(source, new Blob([new Uint8Array(300)], { type: "image/png" })).file).toBe(source);
    expect(selectPosterFile(source, null).file).toBe(source);
  });
  test("refuses an oversize upload even if WebP was smaller than the source", () => {
    const original = photo(MAX_POSTER_UPLOAD_BYTES + 20);
    expect(() => selectPosterFile(original, null)).toThrow();
    expect(() => selectPosterFile(original, new Blob([new Uint8Array(MAX_POSTER_UPLOAD_BYTES + 1)], { type: "image/webp" }))).toThrow();
    expect(selectPosterFile(original, new Blob([new Uint8Array(1024)], { type: "image/webp" })).file.size).toBe(1024);
  });
  test("formats file sizes for the feedback label", () => {
    expect(posterFileSize(1024)).toBe("1 KB");
    expect(posterFileSize(2 * 1024 * 1024)).toBe("2.00 MB");
  });
});
