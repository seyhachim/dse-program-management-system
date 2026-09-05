import { describe, expect, test } from "bun:test";
import { MOBILE_ATTENDANCE_LAYOUT } from "./mobile-attendance-layout";

describe("mobile Attendance layout", () => {
  test("phone controls and primary action are touch-sized", () => {
    expect(MOBILE_ATTENDANCE_LAYOUT.control).toContain("h-11");
    expect(MOBILE_ATTENDANCE_LAYOUT.primaryAction).toContain("h-11");
    expect(MOBILE_ATTENDANCE_LAYOUT.primaryAction).toContain("w-full");
    expect(MOBILE_ATTENDANCE_LAYOUT.secondaryAction).toContain("min-h-11");
  });

  test("register and history switch from cards to desktop tables at md", () => {
    expect(MOBILE_ATTENDANCE_LAYOUT.mobileRegister).toContain("md:hidden");
    expect(MOBILE_ATTENDANCE_LAYOUT.mobileHistory).toContain("md:hidden");
    expect(MOBILE_ATTENDANCE_LAYOUT.desktopRegister).toContain("md:block");
    expect(MOBILE_ATTENDANCE_LAYOUT.desktopHistory).toContain("md:block");
  });

  test("phone summary uses two columns and compact page gutters", () => {
    expect(MOBILE_ATTENDANCE_LAYOUT.summary).toContain("grid-cols-2");
    expect(MOBILE_ATTENDANCE_LAYOUT.summary).toContain("xl:grid-cols-6");
    expect(MOBILE_ATTENDANCE_LAYOUT.main).toContain("p-3");
    expect(MOBILE_ATTENDANCE_LAYOUT.main).toContain("md:p-6");
  });
});
