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

  test("does not expose known private, workflow-only, or internal tracker details", () => {
    const serialized = JSON.stringify(publicProgrammeContent).toLowerCase();

    for (const key of forbiddenPublicKeys) {
      expect(serialized).not.toContain(`\"${key.toLowerCase()}\"`);
    }

    expect(serialized).not.toMatch(/#\d+/);
  });
});
