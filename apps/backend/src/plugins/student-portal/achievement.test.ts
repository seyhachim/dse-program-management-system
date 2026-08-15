import { describe, expect, test } from "bun:test";
import { calculateCloAchievements } from "./service.ts";

describe("student portal CLO achievement", () => {
  test("uses only explicitly mapped published evidence and does not reuse course grade weights", () => {
    const achievements = calculateCloAchievements(
      [
        { order: 0, description: "Apply programming concepts", status: "Active" },
        { order: 1, description: "Communicate solutions", status: "Active" },
      ],
      [
        { id: "attendance", cloCodes: [], weight: 10, status: "Active" },
        { id: "assignment", cloCodes: ["CLO1"], weight: 20, status: "Active" },
        { id: "exam", cloCodes: ["CLO1", "CLO2"], weight: 40, status: "Active" },
      ],
      [
        { assessmentItemId: "attendance", score: 100, maxScore: 100 },
        { assessmentItemId: "assignment", score: 80, maxScore: 100 },
        { assessmentItemId: "exam", score: 20, maxScore: 40 },
      ],
    );

    // CLO evidence is averaged independently from the local course-grade weights:
    // CLO1 = average(80%, 50%) = 65%, not weighted by 20%/40% grade weights.
    expect(achievements[0]).toMatchObject({ code: "CLO1", percentage: 65, status: "developing", evidenceCount: 2 });
    expect(achievements[1]).toMatchObject({ code: "CLO2", percentage: 50, status: "developing", evidenceCount: 1 });
  });

  test("reports no evidence without inventing a score", () => {
    const [achievement] = calculateCloAchievements(
      [{ order: 0, description: "Apply programming concepts", status: "Active" }],
      [{ id: "assignment", cloCodes: ["CLO1"], weight: 20, status: "Active" }],
      [],
    );
    expect(achievement).toMatchObject({ percentage: null, status: "not-enough-evidence", evidenceCount: 0 });
  });

  test("grade-only components do not contribute to CLO achievement", () => {
    const [achievement] = calculateCloAchievements(
      [{ order: 0, description: "Apply programming concepts", status: "Active" }],
      [{ id: "attendance", cloCodes: [], weight: 10, status: "Active" }],
      [{ assessmentItemId: "attendance", score: 100, maxScore: 100 }],
    );
    expect(achievement).toMatchObject({ percentage: null, status: "not-enough-evidence", evidenceCount: 0 });
  });

  test("ignores inactive CLOs and inactive assessments", () => {
    const achievements = calculateCloAchievements(
      [
        { order: 0, description: "Active", status: "Active" },
        { order: 1, description: "Inactive", status: "Inactive" },
      ],
      [{ id: "old", cloCodes: ["CLO1"], weight: 100, status: "Inactive" }],
      [{ assessmentItemId: "old", score: 100, maxScore: 100 }],
    );
    expect(achievements).toHaveLength(1);
    expect(achievements[0]?.percentage).toBeNull();
  });
});
