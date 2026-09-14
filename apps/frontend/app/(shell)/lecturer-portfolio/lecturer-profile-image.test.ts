import { describe, expect, test } from "bun:test";
import { CHIM_SEYHA_PROFILE_IMAGE, lecturerProfileImage } from "./lecturer-profile-image";

describe("lecturerProfileImage", () => {
  test("returns Chim Seyha's official PMS profile photo", () => {
    expect(lecturerProfileImage("chim.seyha@rupp.edu.kh")).toBe(CHIM_SEYHA_PROFILE_IMAGE);
    expect(lecturerProfileImage("  CHIM.SEYHA@RUPP.EDU.KH  ")).toBe(CHIM_SEYHA_PROFILE_IMAGE);
  });

  test("preserves initials fallback for lecturers without a mapped photo", () => {
    expect(lecturerProfileImage("another.lecturer@rupp.edu.kh")).toBeNull();
    expect(lecturerProfileImage(null)).toBeNull();
  });
});
