import { describe, expect, test } from "bun:test";
import { MOBILE_RESULTS_LAYOUT } from "./mobile-results-layout";

describe("mobile Results layout", () => {
  test("phone selector and refresh are viewport-safe and touch-sized", () => {
    expect(MOBILE_RESULTS_LAYOUT.selector).toContain("w-full");
    expect(MOBILE_RESULTS_LAYOUT.selector).toContain("min-w-0");
    expect(MOBILE_RESULTS_LAYOUT.selector).toContain("h-11");
    expect(MOBILE_RESULTS_LAYOUT.refresh).toContain("w-full");
    expect(MOBILE_RESULTS_LAYOUT.refresh).toContain("h-11");
  });

  test("result and correction rows switch from cards to tables at md", () => {
    expect(MOBILE_RESULTS_LAYOUT.mobileRows).toContain("md:hidden");
    expect(MOBILE_RESULTS_LAYOUT.desktopRows).toContain("md:block");
    expect(MOBILE_RESULTS_LAYOUT.mobileCorrectionRows).toContain("md:hidden");
    expect(MOBILE_RESULTS_LAYOUT.desktopCorrectionRows).toContain("md:block");
  });

  test("metrics use a compact phone grid", () => {
    expect(MOBILE_RESULTS_LAYOUT.metrics).toContain("grid-cols-2");
    expect(MOBILE_RESULTS_LAYOUT.metrics).toContain("xl:grid-cols-5");
    expect(MOBILE_RESULTS_LAYOUT.finalMetric).toContain("col-span-2");
  });
});
