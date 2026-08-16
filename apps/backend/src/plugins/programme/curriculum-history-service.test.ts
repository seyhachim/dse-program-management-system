import { describe, expect, test } from "bun:test";
import type { CurriculumCourse, ProgrammeCurriculumRead } from "@dse-pms/shared-types";
import { compareCurriculumReads } from "./curriculum-history-service.ts";

const curriculumId = crypto.randomUUID();
const actorId = crypto.randomUUID();

function read(versionId: string, courses: CurriculumCourse[]): ProgrammeCurriculumRead {
  const years = [1, 2, 3, 4].map((yearLevel) => {
    const semesters = (["First", "Second"] as const).map((semester) => {
      const scoped = courses.filter((course) => course.yearLevel === yearLevel && course.semester === semester);
      return { semester, courses: scoped, totalCredits: scoped.reduce((sum, course) => sum + course.credits, 0) };
    });
    return { yearLevel, semesters, totalCredits: semesters.reduce((sum, semester) => sum + semester.totalCredits, 0) };
  });
  return {
    curriculum: { id: curriculumId, programmeId: "dse", code: "DSE", name: "DSE" },
    selectedVersion: {
      id: versionId,
      versionMajor: 1,
      versionMinor: 0,
      version: "1.0",
      status: "Draft",
      revisionType: "Initial",
      revisionTriggers: [],
      revisionReason: "",
      changeSummary: "",
      basedOnVersionId: null,
      cohortLabel: "2026",
      intakeYear: 2026,
      academicYear: "2026-2027",
      effectiveFrom: null,
      approvedAt: null,
      createdById: actorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    versions: [],
    years,
    totals: { programmeCredits: 0, basicCredits: 0, coreCredits: 0, electiveCredits: 0, specializationCredits: 0, moeysHeipCredits: 0 },
  };
}

function course(id: string, overrides: Partial<CurriculumCourse> = {}): CurriculumCourse {
  return {
    placementId: crypto.randomUUID(),
    courseId: id,
    code: "C",
    title: "Course",
    yearLevel: 1,
    semester: "First",
    credits: 3,
    courseType: "Core",
    sortOrder: 0,
    ...overrides,
  };
}

describe("curriculum comparison", () => {
  test("detects add and remove", () => {
    const removed = crypto.randomUUID();
    const added = crypto.randomUUID();
    const result = compareCurriculumReads(read(crypto.randomUUID(), [course(removed)]), read(crypto.randomUUID(), [course(added)]));
    expect(result.changes.find((item) => item.courseId === removed)?.changes).toEqual(["Removed"]);
    expect(result.changes.find((item) => item.courseId === added)?.changes).toEqual(["Added"]);
  });

  test("detects year, semester, credits, type and meaningful order changes", () => {
    const moved = crypto.randomUUID();
    const ordered = crypto.randomUUID();
    const before = read(crypto.randomUUID(), [course(moved), course(ordered, { sortOrder: 1 })]);
    const after = read(crypto.randomUUID(), [
      course(moved, { yearLevel: 2, semester: "Second", credits: 4, courseType: "Specialization" }),
      course(ordered, { sortOrder: 0 }),
    ]);
    const result = compareCurriculumReads(before, after);
    expect(result.changes.find((item) => item.courseId === moved)?.changes).toEqual([
      "YearChanged",
      "SemesterChanged",
      "CreditsChanged",
      "TypeChanged",
    ]);
    expect(result.changes.find((item) => item.courseId === ordered)?.changes).toEqual(["OrderChanged"]);
    expect(result.counts.coursesChanged).toBe(2);
  });

  test("combines multiple changes once and identical snapshots are empty", () => {
    const id = crypto.randomUUID();
    const before = read(crypto.randomUUID(), [course(id)]);
    const changed = read(crypto.randomUUID(), [course(id, { credits: 5, courseType: "Elective" })]);
    const result = compareCurriculumReads(before, changed);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.changes).toEqual(["CreditsChanged", "TypeChanged"]);
    expect(compareCurriculumReads(before, read(crypto.randomUUID(), [course(id)])).changes).toEqual([]);
  });
});
