import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  parsePublicAcademicYear,
  parsePublicStudyYear,
  publicAcademicCalendarEndpoint,
} from "./public-academic-calendar-query";

describe("public academic calendar handbook URLs", () => {
  test("preserves the canonical AcademicYear label rather than substituting an en dash", () => {
    expect(parsePublicAcademicYear("2026-2027")).toBe("2026-2027");
    expect(parsePublicAcademicYear("2026%E2%80%932027")).toBe("2026–2027");
  });

  test("queries the correct published academic year for all four study-year links", () => {
    for (const year of [1, 2, 3, 4]) {
      const studyYear = parsePublicStudyYear(`year-${year}`);
      const endpoint = publicAcademicCalendarEndpoint(
        "https://api.example.test",
        "dse",
        parsePublicAcademicYear("2026-2027"),
        studyYear,
      );
      expect(endpoint).not.toBeNull();
      const url = new URL(endpoint!);
      expect(url.pathname).toBe("/api/programme/public/programmes/dse/academic-calendar");
      expect(url.searchParams.get("academicYear")).toBe("2026-2027");
      expect(url.searchParams.get("studyYear")).toBe(String(year));
    }
  });

  test("supports stored Unicode labels without silently rewriting the year", () => {
    const endpoint = publicAcademicCalendarEndpoint(
      "https://api.example.test",
      "dse",
      parsePublicAcademicYear("2025%E2%80%932026"),
      parsePublicStudyYear("year-3"),
    );
    expect(new URL(endpoint!).searchParams.get("academicYear")).toBe("2025–2026");
  });

  test("rejects invalid study-year segments without substituting another calendar", () => {
    for (const segment of ["year-0", "year-5", "year-3-other", "", "abc"]) {
      expect(parsePublicStudyYear(segment)).toBeNull();
      expect(publicAcademicCalendarEndpoint("https://api.example.test", "dse", "2026-2027", parsePublicStudyYear(segment))).toBeNull();
    }
    expect(publicAcademicCalendarEndpoint("https://api.example.test", "dse", "2026-2027", 0)).toBeNull();
    expect(publicAcademicCalendarEndpoint("https://api.example.test", "dse", "2026-2027", 5)).toBeNull();
  });

  test("page uses the exact-label query and retains published-only and unavailable states", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(page).toContain("parsePublicAcademicYear(routeParams.academicYear)");
    expect(page).toContain("parsePublicStudyYear(routeParams.studyYear)");
    expect(page).toContain("publicAcademicCalendarEndpoint(API_URL, programmeId, academicYear, studyYear)");
    expect(page).not.toContain('.replace(/-/g, "–")');
    expect(page).toContain('data?.status === "available"');
    expect(page).toContain('data?.status === "unavailable"');
  });
});
