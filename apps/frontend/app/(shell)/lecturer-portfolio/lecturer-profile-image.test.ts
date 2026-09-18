import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CHIM_SEYHA_PROFILE_IMAGE, lecturerProfileImage } from "./lecturer-profile-image";

/** Validate JPEG segment ordering, not just a .jpg extension or SOI magic bytes. */
function hasValidJpegStructure(image: Buffer): boolean {
  if (image.length < 6 || image[0] !== 0xff || image[1] !== 0xd8) return false;
  if (image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) return false;

  let offset = 2;
  let seenFrame = false;
  while (offset < image.length - 2) {
    if (image[offset] !== 0xff) return false;
    while (image[offset] === 0xff) offset++;
    const marker = image[offset++];
    if (marker === 0xda) return seenFrame; // Start of scan requires an earlier frame header.
    if (marker === 0xd8 || marker === 0xd9 || marker === undefined) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > image.length) return false;
    const length = image.readUInt16BE(offset);
    if (length < 2 || offset + length > image.length) return false;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      seenFrame = true;
    }
    offset += length;
  }
  return false;
}

describe("lecturerProfileImage", () => {
  test("returns Chim Seyha's official PMS profile photo", () => {
    expect(lecturerProfileImage("chim.seyha@rupp.edu.kh")).toBe(CHIM_SEYHA_PROFILE_IMAGE);
    expect(lecturerProfileImage("  CHIM.SEYHA@RUPP.EDU.KH  ")).toBe(CHIM_SEYHA_PROFILE_IMAGE);
  });

  test("committed official photo is a structurally valid JPEG", () => {
    const image = readFileSync(new URL("../../../public/staff/chim-seyha.jpg", import.meta.url));
    expect(hasValidJpegStructure(image)).toBe(true);
  });

  test("preserves initials fallback for lecturers without a mapped photo", () => {
    expect(lecturerProfileImage("another.lecturer@rupp.edu.kh")).toBeNull();
    expect(lecturerProfileImage(null)).toBeNull();
  });
});
