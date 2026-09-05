import { describe, expect, test } from "bun:test";
import { MOBILE_ANNOUNCEMENTS_LAYOUT } from "./mobile-announcements-layout";

describe("mobile Announcements layout", () => {
  test("course selector fits narrow viewports and stays touch-sized", () => {
    expect(MOBILE_ANNOUNCEMENTS_LAYOUT.sectionSelector).toContain("w-full");
    expect(MOBILE_ANNOUNCEMENTS_LAYOUT.sectionSelector).toContain("min-w-0");
    expect(MOBILE_ANNOUNCEMENTS_LAYOUT.sectionSelector).toContain("h-11");
  });

  test("publish action is full-width on phone", () => {
    expect(MOBILE_ANNOUNCEMENTS_LAYOUT.publishAction).toContain("w-full");
    expect(MOBILE_ANNOUNCEMENTS_LAYOUT.publishAction).toContain("h-11");
    expect(MOBILE_ANNOUNCEMENTS_LAYOUT.publishAction).toContain("sm:w-auto");
  });

  test("page uses compact phone gutters", () => {
    expect(MOBILE_ANNOUNCEMENTS_LAYOUT.main).toContain("p-3");
    expect(MOBILE_ANNOUNCEMENTS_LAYOUT.main).toContain("md:p-6");
  });
});
