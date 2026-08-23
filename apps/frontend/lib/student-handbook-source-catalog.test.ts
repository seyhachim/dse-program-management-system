import { describe, expect, test } from "bun:test";
import {
  availableStudentHandbookSources,
  filterStudentHandbookSources,
  recommendedStudentHandbookSources,
  studentHandbookSourceLabel,
} from "./student-handbook-source-catalog";

describe("Student Handbook source catalogue", () => {
  test("filters sources by label, category, and keyword", () => {
    expect(filterStudentHandbookSources("credits").map((item) => item.kind)).toEqual([
      "CURRICULUM_SUMMARY",
    ]);
    expect(filterStudentHandbookSources("programme").map((item) => item.kind)).toContain(
      "PROGRAMME_PROFILE",
    );
    expect(filterStudentHandbookSources("contact").map((item) => item.kind)).toEqual([
      "PROGRAMME_CONTACT",
    ]);
  });

  test("returns section-aware recommendations", () => {
    expect(recommendedStudentHandbookSources("study-plan").map((item) => item.kind)).toEqual([
      "CURRICULUM_SUMMARY",
    ]);
    expect(recommendedStudentHandbookSources("important-contacts").map((item) => item.kind)).toEqual([
      "PROGRAMME_CONTACT",
    ]);
  });

  test("prevents duplicate source kinds already present in the section", () => {
    const available = availableStudentHandbookSources(["CURRICULUM_SUMMARY"]);
    expect(available.map((item) => item.kind)).not.toContain("CURRICULUM_SUMMARY");
    expect(available.map((item) => item.kind)).toContain("PROGRAMME_PROFILE");
  });

  test("exposes stable labels for source blocks", () => {
    expect(studentHandbookSourceLabel("PROGRAMME_CONTACT")).toBe("Programme contacts");
  });
});
