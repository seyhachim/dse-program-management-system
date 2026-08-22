import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  commitStudentRosterImport,
  parseStudentRosterImportDocument,
  StudentRosterImportBlockedError,
} from "./student-roster-import.ts";

const describeDb = process.env.STUDENT_ROSTER_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb("student roster import database integrity", () => {
  test("imports nullable-email profiles/cohort membership idempotently and rolls back a blocked batch", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cohortCode = `TEST-G540-${suffix}`;
    const blockedCohortCode = `TEST-G540-BLOCK-${suffix}`;
    const studentIds = [`TEST-540-A-${suffix}`, `TEST-540-B-${suffix}`, `TEST-540-C-${suffix}`];

    const document = parseStudentRosterImportDocument({
      schemaVersion: 1,
      source: "issue-540-db-test.json",
      programmeId: "dse",
      importMode: "one-time-upsert",
      cohorts: [
        {
          code: cohortCode,
          name: "Issue 540 Test Cohort",
          intakeYear: 2026,
          expectedGraduationYear: 2030,
          joinedAt: "2026-11-01",
          status: "Active",
        },
      ],
      students: [
        {
          sourceRef: "test/row-1",
          cohortCode,
          studentId: studentIds[0],
          name: "Roster Student One",
          email: null,
          profile: {
            khmerFamilyName: "សាកល្បង",
            khmerGivenName: "មួយ",
            latinFamilyName: "Roster",
            latinGivenName: "One",
            gender: "Female",
          },
        },
        {
          sourceRef: "test/row-2",
          cohortCode,
          studentId: studentIds[1],
          name: "Roster Student Two",
          email: null,
        },
      ],
    });

    try {
      const first = await commitStudentRosterImport(prisma, document);
      expect(first.mode).toBe("commit");
      expect(first.wouldCreate).toBe(2);
      expect(first.blocked).toBe(0);

      const students = await prisma.student.findMany({
        where: { studentId: { in: studentIds.slice(0, 2) } },
        include: { profile: true, enrollments: true, cohortMemberships: { include: { cohort: true } } },
        orderBy: { studentId: "asc" },
      });
      expect(students).toHaveLength(2);
      expect(students.every((student) => student.email === null)).toBe(true);
      expect(students.every((student) => student.userId === null)).toBe(true);
      expect(students.every((student) => student.enrollments.length === 0)).toBe(true);
      expect(students.every((student) => student.cohortMemberships.length === 1)).toBe(true);
      expect(students.every((student) => student.cohortMemberships[0]?.cohort.code === cohortCode)).toBe(true);
      expect(students.find((student) => student.studentId === studentIds[0])?.profile).toMatchObject({
        khmerFamilyName: "សាកល្បង",
        khmerGivenName: "មួយ",
        latinFamilyName: "Roster",
        latinGivenName: "One",
        gender: "Female",
      });

      const second = await commitStudentRosterImport(prisma, document);
      expect(second.unchanged).toBe(2);
      expect(second.wouldCreate).toBe(0);
      expect(second.wouldUpdate).toBe(0);
      expect(
        await prisma.studentCohortMembership.count({
          where: { student: { studentId: { in: studentIds.slice(0, 2) } }, cohort: { code: cohortCode } },
        }),
      ).toBe(2);

      const blocked = parseStudentRosterImportDocument({
        schemaVersion: 1,
        source: "issue-540-blocked-db-test.json",
        programmeId: "dse",
        importMode: "one-time-upsert",
        cohorts: [
          {
            code: blockedCohortCode,
            name: "Blocked Test Cohort",
            intakeYear: 2026,
            expectedGraduationYear: 2030,
            joinedAt: "2026-11-01",
          },
        ],
        students: [
          {
            sourceRef: "blocked/row-1",
            cohortCode: blockedCohortCode,
            studentId: studentIds[2],
            name: "Would Otherwise Be Created",
          },
          {
            sourceRef: "blocked/row-2",
            cohortCode: blockedCohortCode,
            studentId: null,
            name: "Missing Official ID",
          },
        ],
      });

      await expect(commitStudentRosterImport(prisma, blocked)).rejects.toBeInstanceOf(
        StudentRosterImportBlockedError,
      );
      expect(await prisma.student.findUnique({ where: { studentId: studentIds[2]! } })).toBeNull();
      expect(
        await prisma.studentCohort.findUnique({
          where: { programmeId_code: { programmeId: "dse", code: blockedCohortCode } },
        }),
      ).toBeNull();
    } finally {
      await prisma.studentCohortMembership.deleteMany({
        where: { student: { studentId: { in: studentIds } } },
      });
      await prisma.student.deleteMany({ where: { studentId: { in: studentIds } } });
      await prisma.studentCohort.deleteMany({
        where: { programmeId: "dse", code: { in: [cohortCode, blockedCohortCode] } },
      });
      await prisma.$disconnect();
    }
  }, 30_000);
});
