import { describe, expect, test } from "bun:test";
import { publicProgrammeContent } from "./public-programme";

const forbiddenPublicKeys = [
  "student",
  "authId",
  "email",
  "phone",
  "permission",
  "roleAssignment",
  "qaEvidence",
  "sar",
  "draft",
  "reviewerId",
  "submittedById",
  "internalId",
];

describe("public programme presentation contract", () => {
  test("is explicitly marked as curated fallback until Approved/Active publication is connected", () => {
    expect(publicProgrammeContent.source).toBe("curated-fallback");
    expect(publicProgrammeContent.curriculumPreview.note.toLowerCase()).toContain("approved");
    expect(publicProgrammeContent.curriculumPreview.note.toLowerCase()).toContain("active");
  });

  test("contains the agreed homepage sections", () => {
    expect(publicProgrammeContent.snapshot).toHaveLength(4);
    expect(publicProgrammeContent.learningThemes).toHaveLength(6);
    expect(publicProgrammeContent.journey).toHaveLength(4);
    expect(publicProgrammeContent.practice).toHaveLength(5);
    expect(publicProgrammeContent.careers.length).toBeGreaterThanOrEqual(5);
    expect(publicProgrammeContent.stories).toHaveLength(3);
  });

  test("reflects the 2026 fallback programme snapshot", () => {
    expect(publicProgrammeContent.snapshot).toEqual([
      { value: "4 Years", label: "Programme duration" },
      { value: "8 Semesters", label: "Academic structure" },
      { value: "143 Credits", label: "Curriculum snapshot" },
      { value: "B.Eng.", label: "Bachelor of Engineering" },
    ]);
  });

  test("uses the current Year 1 course codes", () => {
    const courseCodes = publicProgrammeContent.curriculumPreview.semesters.flatMap((semester) =>
      semester.courses.map((course) => course.code),
    );

    expect(courseCodes).toEqual([
      "ENG101",
      "IDS101",
      "BPR101",
      "DLP101",
      "CCS101",
      "KHI101",
      "ENG102",
      "MAT102",
      "APR102",
      "STA102",
      "PDT102",
      "KCI102",
    ]);
  });

  test("describes Year 4 as a choice of final pathway", () => {
    const yearFour = publicProgrammeContent.journey.find((item) => item.year === "Year 4");

    expect(yearFour?.label).toContain("coursework, thesis or industrial pathway");
  });

  test("does not expose known private, workflow-only, or internal tracker details", () => {
    const serialized = JSON.stringify(publicProgrammeContent).toLowerCase();

    for (const key of forbiddenPublicKeys) {
      expect(serialized).not.toContain(`\"${key.toLowerCase()}\"`);
    }

    expect(serialized).not.toMatch(/#\d+/);
  });
});
