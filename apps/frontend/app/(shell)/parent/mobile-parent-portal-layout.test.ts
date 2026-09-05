import { describe, expect, test } from "bun:test";
import { MOBILE_PARENT_PORTAL_LAYOUT } from "./mobile-parent-portal-layout";

describe("mobile Parent Portal layout", () => {
  test("uses compact viewport-safe phone gutters", () => {
    expect(MOBILE_PARENT_PORTAL_LAYOUT.page).toContain("min-w-0");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.page).toContain("px-3");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.page).toContain("sm:p-6");
  });

  test("linked-student selector is full-width and touch-sized on phone", () => {
    expect(MOBILE_PARENT_PORTAL_LAYOUT.selectorLabel).toContain("w-full");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.selector).toContain("min-h-11");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.selector).toContain("w-full");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.selector).toContain("sm:w-auto");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.selector).toContain("sm:min-w-60");
  });

  test("relationship facts and attendance header stack before larger breakpoints", () => {
    expect(MOBILE_PARENT_PORTAL_LAYOUT.factRow).toContain("flex-col");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.factRow).toContain("sm:flex-row");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.attendanceHeader).toContain("flex-col");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.attendanceHeader).toContain("sm:flex-row");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.attendanceMetricGrid).toContain("grid-cols-2");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.attendanceMetricGrid).toContain("sm:grid-cols-3");
  });

  test("official results stack on phones and preserve grade separation", () => {
    expect(MOBILE_PARENT_PORTAL_LAYOUT.resultRow).toContain("flex-col");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.resultRow).toContain("sm:flex-row");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.resultText).toContain("break-words");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.resultGrade).toContain("shrink-0");
  });

  test("long protected content wraps instead of widening the viewport", () => {
    expect(MOBILE_PARENT_PORTAL_LAYOUT.card).toContain("min-w-0");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.factValue).toContain("break-words");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.warning).toContain("min-w-0");
    expect(MOBILE_PARENT_PORTAL_LAYOUT.wrap).toContain("break-words");
  });
});
