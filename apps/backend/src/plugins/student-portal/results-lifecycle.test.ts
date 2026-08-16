import { describe, expect, test } from "bun:test";
import { PortalConflictError } from "./service.ts";
import {
  assertDraftWritable,
  buildStudentResultReview,
  canManageOfferingResults,
  publicationReadiness,
} from "./results-lifecycle.ts";

describe("results lifecycle", () => {
  test("allows draft rows to remain editable", () => {
    expect(() => assertDraftWritable(null)).not.toThrow();
  });

  test("blocks ordinary edits after publication", () => {
    expect(() => assertDraftWritable(new Date("2026-08-16T00:00:00Z"))).toThrow(PortalConflictError);
  });

  test("requires every enrolled student to have a valid draft before publication", () => {
    const readiness = publicationReadiness(
      ["e1", "e2"],
      [{ enrollmentId: "e1", score: 80, maxScore: 100, publishedAt: null }],
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.missingEnrollmentIds).toEqual(["e2"]);
  });

  test("rejects invalid stored marks before publication", () => {
    const readiness = publicationReadiness(
      ["e1"],
      [{ enrollmentId: "e1", score: 101, maxScore: 100, publishedAt: null }],
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.invalidEnrollmentIds).toEqual(["e1"]);
  });

  test("recognizes a complete unpublished assessment as publishable", () => {
    const readiness = publicationReadiness(
      ["e1", "e2"],
      [
        { enrollmentId: "e1", score: 0, maxScore: 100, publishedAt: null },
        { enrollmentId: "e2", score: 100, maxScore: 100, publishedAt: null },
      ],
    );
    expect(readiness).toEqual({
      ready: true,
      missingEnrollmentIds: [],
      invalidEnrollmentIds: [],
      publishedEnrollmentIds: [],
    });
  });

  test("authorizes assigned primary/co-lecturers and programme-wide roles only", () => {
    expect(canManageOfferingResults("primary", false, "primary", ["co"])).toBe(true);
    expect(canManageOfferingResults("co", false, "primary", ["co"])).toBe(true);
    expect(canManageOfferingResults("admin", true, "primary", ["co"])).toBe(true);
    expect(canManageOfferingResults("other", false, "primary", ["co"])).toBe(false);
  });

  test("builds complete weighted total and CLO evidence from draft or published marks", () => {
    const review = buildStudentResultReview({
      enrollmentId: "enrollment-1",
      student: { id: "student-1", studentId: "DSE001", name: "Student One" },
      clos: [
        { order: 0, description: "Apply core methods", status: "Active" },
        { order: 1, description: "Communicate findings", status: "Active" },
      ],
      assessments: [
        { id: "a1", name: "Project", status: "Active", weight: 60, cloCodes: ["CLO1"] },
        { id: "a2", name: "Final", status: "Active", weight: 40, cloCodes: ["CLO1", "CLO2"] },
      ],
      results: [
        { assessmentItemId: "a1", score: 80, maxScore: 100 },
        { assessmentItemId: "a2", score: 90, maxScore: 100 },
      ],
    });

    expect(review.completedGradeWeight).toBe(100);
    expect(review.configuredGradeWeight).toBe(100);
    expect(review.courseGradeComplete).toBe(true);
    expect(review.totalCourseGrade).toBe(84);
    expect(review.overallAchievement).toBe(88);
    expect(review.achievements[0]).toMatchObject({
      code: "CLO1",
      percentage: 85,
      evidenceCount: 2,
    });
    expect(review.achievements[0]?.evidence).toEqual([
      { assessmentItemId: "a1", assessmentName: "Project", rawPercentage: 80 },
      { assessmentItemId: "a2", assessmentName: "Final", rawPercentage: 90 },
    ]);
    expect(review.achievements[1]).toMatchObject({
      code: "CLO2",
      percentage: 90,
      evidenceCount: 1,
    });
  });

  test("keeps weighted total incomplete when grade weight is missing and surfaces CLO evidence gaps", () => {
    const review = buildStudentResultReview({
      enrollmentId: "enrollment-2",
      student: { id: "student-2", studentId: "DSE002", name: "Student Two" },
      clos: [
        { order: 0, description: "Apply core methods", status: "Active" },
        { order: 1, description: "Communicate findings", status: "Active" },
      ],
      assessments: [
        { id: "a1", name: "Project", status: "Active", weight: 60, cloCodes: ["CLO1"] },
        { id: "a2", name: "Final", status: "Active", weight: 40, cloCodes: ["CLO1"] },
      ],
      results: [{ assessmentItemId: "a1", score: 75, maxScore: 100 }],
    });

    expect(review.completedGradeWeight).toBe(60);
    expect(review.configuredGradeWeight).toBe(100);
    expect(review.courseGradeComplete).toBe(false);
    expect(review.totalCourseGrade).toBeNull();
    expect(review.achievements[0]).toMatchObject({ code: "CLO1", percentage: 75, evidenceCount: 1 });
    expect(review.achievements[1]).toMatchObject({
      code: "CLO2",
      percentage: null,
      evidenceCount: 0,
      status: "not-enough-evidence",
    });
  });
});
