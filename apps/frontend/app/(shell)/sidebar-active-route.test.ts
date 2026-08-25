import { describe, expect, test } from "bun:test";
import { findMostSpecificActivePath } from "./sidebar-active-route";

describe("findMostSpecificActivePath", () => {
  test("prefers an exact nested route over its parent", () => {
    expect(
      findMostSpecificActivePath("/aun-qa/sar-preview", [
        "/aun-qa",
        "/aun-qa/sar-preview",
      ]),
    ).toBe("/aun-qa/sar-preview");
  });

  test("keeps the nearest registered parent active for deeper pages", () => {
    expect(
      findMostSpecificActivePath("/aun-qa/sar-preview/criterion-1", [
        "/aun-qa",
        "/aun-qa/sar-preview",
      ]),
    ).toBe("/aun-qa/sar-preview");
  });

  test("does not treat root as a prefix match", () => {
    expect(findMostSpecificActivePath("/courses", ["/", "/courses"])).toBe(
      "/courses",
    );
  });

  test("returns null when no route matches", () => {
    expect(findMostSpecificActivePath("/unknown", ["/courses", "/aun-qa"])).toBe(
      null,
    );
  });
});
