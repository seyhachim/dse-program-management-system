import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { PUBLIC_CALENDAR_STUDY_YEARS, publicCalendarYearHref } from "./public-calendar-year-links";

describe("public Academic Calendar year hub", () => {
  test("offers exactly Year 1 through Year 4", () => {
    expect([...PUBLIC_CALENDAR_STUDY_YEARS]).toEqual([1, 2, 3, 4]);
  });

  test("keeps the published-only destination routes and the exact academic-year label", () => {
    for (const year of PUBLIC_CALENDAR_STUDY_YEARS) {
      expect(publicCalendarYearHref("dse", "2026-2027", year)).toBe(
        `/calendar/dse/2026-2027/year-${year}`,
      );
    }
  });

  test("URL-encodes programme and year segments instead of rewriting canonical labels", () => {
    expect(publicCalendarYearHref("dse/sub", "2026–2027", 3)).toBe(
      "/calendar/dse%2Fsub/2026%E2%80%932027/year-3",
    );
  });

  test("page uses accessible links that open in separate tabs without exposing private data", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(page).toContain("PUBLIC_CALENDAR_STUDY_YEARS.map((studyYear)");
    expect(page).toContain("publicCalendarYearHref(programmeId, academicYear, studyYear)");
    expect(page).toContain('target="_blank"');
    expect(page).toContain('rel="noopener noreferrer"');
    expect(page).toContain('aria-label={`Open Year ${studyYear} academic calendar in a new tab`}');
    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("NEXT_PUBLIC_API_URL");
  });
});
