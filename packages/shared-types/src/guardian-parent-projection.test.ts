import { describe, expect, test } from "bun:test";
import {
  ParentAcademicProgressSummarySchema,
  ParentAttendanceSummarySchema,
} from "./guardian";

const RELATIONSHIP_ID = "11111111-1111-4111-8111-111111111111";
const STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const OFFERING_ID = "33333333-3333-4333-8333-333333333333";

describe("parent-safe guardian projection contracts", () => {
  test("accepts the attendance allow-list", () => {
    expect(ParentAttendanceSummarySchema.parse({
      relationshipId: RELATIONSHIP_ID,
      studentId: STUDENT_ID,
      programmeId: "DSE",
      totalSessions: 10,
      markedSessions: 9,
      attendanceRate: 88.89,
      counts: { Present: 6, Absent: 1, Late: 2, Excused: 0, PermissionPending: 1 },
      healthState: "watch",
      warnings: [{
        offeringId: OFFERING_ID,
        courseCode: "DSE101",
        kind: "attendance",
        level: "watch",
        count: 2,
        message: "1 absent · 1 permission / excused.",
      }],
    }).attendanceRate).toBe(88.89);
  });

  test("rejects attendance notes and confidential extras", () => {
    expect(() => ParentAttendanceSummarySchema.parse({
      relationshipId: RELATIONSHIP_ID,
      studentId: STUDENT_ID,
      programmeId: "DSE",
      totalSessions: 1,
      markedSessions: 1,
      attendanceRate: 100,
      counts: { Present: 1, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0 },
      healthState: "healthy",
      warnings: [],
      note: "private lecturer note",
    })).toThrow();
  });

  test("accepts only course-level finalized academic results", () => {
    const parsed = ParentAcademicProgressSummarySchema.parse({
      relationshipId: RELATIONSHIP_ID,
      studentId: STUDENT_ID,
      programmeId: "DSE",
      academicStatus: "ON_TRACK",
      progressionStatus: "Progressed",
      academicYear: "2026-2027",
      programmeYear: 2,
      officialResults: [{
        offeringId: OFFERING_ID,
        courseCode: "DSE101",
        courseTitle: "Introduction",
        term: "Semester 1",
        sectionCode: "A",
        totalGrade: 82,
        finalizedAt: "2026-08-31T03:00:00.000Z",
      }],
    });
    expect(parsed.officialResults[0]?.totalGrade).toBe(82);
  });

  test("rejects detailed assessment scores and lecturer feedback", () => {
    expect(() => ParentAcademicProgressSummarySchema.parse({
      relationshipId: RELATIONSHIP_ID,
      studentId: STUDENT_ID,
      programmeId: "DSE",
      academicStatus: "ON_TRACK",
      progressionStatus: "Progressed",
      academicYear: "2026-2027",
      programmeYear: 2,
      officialResults: [{
        offeringId: OFFERING_ID,
        courseCode: "DSE101",
        courseTitle: "Introduction",
        term: "Semester 1",
        sectionCode: "A",
        totalGrade: 82,
        finalizedAt: "2026-08-31T03:00:00.000Z",
        assessmentScores: [{ name: "Quiz", score: 9 }],
        feedback: "private feedback",
      }],
    })).toThrow();
  });
});
