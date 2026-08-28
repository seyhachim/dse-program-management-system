import { describe, expect, test } from "bun:test";
import { SAR_BOOK_MODE_HREFS, sarBookRequirementHref } from "./sar-book-navigation";

describe("SAR book navigation", () => {
  test("keeps existing requirement editor deep links", () => {
    expect(sarBookRequirementHref("1.1")).toBe("/aun-qa/sar/1.1");
    expect(sarBookRequirementHref("8.5")).toBe("/aun-qa/sar/8.5");
  });

  test("keeps complete-book modes inside the SAR workspace", () => {
    expect(SAR_BOOK_MODE_HREFS).toEqual({
      content: "/aun-qa/sar",
      evidence: "/aun-qa/sar/evidence",
      review: "/aun-qa/sar/review",
      preview: "/aun-qa/sar-preview",
    });
  });
});
