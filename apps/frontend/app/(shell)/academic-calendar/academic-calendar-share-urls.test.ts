import { describe, expect, test } from "bun:test";
import { publicCalendarSharePath, publicCalendarShareUrl } from "./academic-calendar-share-urls";

describe("Academic Calendar public share links", () => {
  const origin = "https://dse-pms.vercel.app";

  test("copies one query-free link for all four study years", () => {
    expect(publicCalendarSharePath("dse", "2026-2027")).toBe("/calendar/dse/2026-2027");
    expect(publicCalendarShareUrl(origin, "dse", "2026-2027")).toBe(
      "https://dse-pms.vercel.app/calendar/dse/2026-2027",
    );
  });

  test("never carries browser tracking parameters into copied links", () => {
    const pageUrl = "https://dse-pms.vercel.app/academic-calendar?utm_source=chatgpt.com&foo=bar";
    expect(publicCalendarShareUrl(pageUrl, "dse", "2026-2027")).toBe(
      "https://dse-pms.vercel.app/calendar/dse/2026-2027",
    );
  });

  test("preserves Year 1–4 destinations", () => {
    for (const year of [1, 2, 3, 4]) {
      expect(publicCalendarShareUrl(origin, "dse", "2026-2027", year)).toBe(
        `https://dse-pms.vercel.app/calendar/dse/2026-2027/year-${year}`,
      );
    }
  });

  test("uses selected academic year and safely encodes programme segments", () => {
    expect(publicCalendarSharePath("dse/sub", "2027–2028")).toBe(
      "/calendar/dse%2Fsub/2027-2028",
    );
    expect(publicCalendarSharePath("dse", "2026 – 2027", 3)).toBe(
      "/calendar/dse/2026-2027/year-3",
    );
  });
});
