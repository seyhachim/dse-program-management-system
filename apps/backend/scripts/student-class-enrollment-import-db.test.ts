import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  commitStudentClassEnrollmentImport,
  parseStudentClassEnrollmentImportDocument,
  StudentClassEnrollmentImportBlockedError,
} from "./student-class-enrollment-import.ts";

const describeDb = process.env.STUDENT_CLASS_ENROLLMENT_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb("student class enrollment import database integrity", () => {
  test("enrolls a canonical cohort student idempotently and rolls back a capacity-blocked batch", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const term = `TEST-1008-${suffix}`;
    const cohortCode = `TEST-1008-COHORT-${suffix}`;
    const courseCodes = [`T1008A-${suffix}`, `T1008B-${suffix}`];
    const studentIds = [`T1008-STUDENT-${suffix}`, `T1008-BLOCKED-${suffix}`];

    let cohortId: string | undefined;
    const courseIds: string[] = [];
    const offeringIds: string[] = [];
    const studentRecordIds: string[] = [];

    try {
      const cohort = await prisma.studentCohort.create({
        data: {
          programmeId: "dse",
          code: cohortCode,
          name: "Issue 1008 Test Cohort",
          intakeYear: 2024,
          expectedGraduationYear: 2028,
          status: "Active",
        },
        select: { id: true },
      });
      cohortId = cohort.id;

      for (const [index, code] of courseCodes.entries()) {
        const course = await prisma.course.create({
          data: {
            programmeId: "dse",
            code,
            title: `Issue 1008 Test Course ${index + 1}`,
          },
          select: { id: true },
        });
        courseIds.push(course.id);

        const offering = await prisma.offering.create({
          data: {
            courseId: course.id,
            term,
            sectionCode: "M1",
            programmeYear: 3,
            capacity: 45,
            status: "Planned",
          },
          select: { id: true },
        });
        offeringIds.push(offering.id);
      }

      for (const [index, studentId] of studentIds.entries()) {
        const student = await prisma.student.create({
          data: {
            studentId,
            name: `Issue 1008 Student ${index + 1}`,
            status: "Active",
          },
          select: { id: true },
        });
        studentRecordIds.push(student.id);
        await prisma.studentCohortMembership.create({
          data: {
            cohortId: cohort.id,
            studentId: student.id,
            joinedAt: new Date("2024-11-01T00:00:00.000Z"),
            note: "Issue #1008 database test",
          },
        });
      }

      const manifestFor = (studentId: string) =>
        parseStudentClassEnrollmentImportDocument({
          schemaVersion: 1,
          source: "issue-1008-db-test.json",
          programmeId: "dse",
          term,
          classes: [
            {
              cohortCode,
              programmeYear: 3,
              classCode: "M1",
              studentIds: [studentId],
            },
          ],
        });

      const first = await commitStudentClassEnrollmentImport(prisma, manifestFor(studentIds[0]!));
      expect(first.mode).toBe("commit");
      expect(first.blockedStudents).toBe(0);
      expect(first.wouldCreateEnrollments).toBe(2);
      expect(
        await prisma.enrollment.count({
          where: { studentId: studentRecordIds[0], offeringId: { in: offeringIds } },
        }),
      ).toBe(2);

      const second = await commitStudentClassEnrollmentImport(prisma, manifestFor(studentIds[0]!));
      expect(second.wouldCreateEnrollments).toBe(0);
      expect(second.unchangedEnrollments).toBe(2);
      expect(
        await prisma.enrollment.count({
          where: { studentId: studentRecordIds[0], offeringId: { in: offeringIds } },
        }),
      ).toBe(2);

      await prisma.offering.update({
        where: { id: offeringIds[1]! },
        data: { capacity: 1 },
      });

      await expect(
        commitStudentClassEnrollmentImport(prisma, manifestFor(studentIds[1]!)),
      ).rejects.toBeInstanceOf(StudentClassEnrollmentImportBlockedError);

      expect(
        await prisma.enrollment.count({
          where: { studentId: studentRecordIds[1], offeringId: { in: offeringIds } },
        }),
      ).toBe(0);
    } finally {
      if (studentRecordIds.length > 0) {
        await prisma.enrollment.deleteMany({ where: { studentId: { in: studentRecordIds } } });
        await prisma.studentCohortMembership.deleteMany({
          where: { studentId: { in: studentRecordIds } },
        });
        await prisma.student.deleteMany({ where: { id: { in: studentRecordIds } } });
      }
      if (offeringIds.length > 0) {
        await prisma.offering.deleteMany({ where: { id: { in: offeringIds } } });
      }
      if (courseIds.length > 0) {
        await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      }
      if (cohortId) {
        await prisma.studentCohort.deleteMany({ where: { id: cohortId } });
      }
      await prisma.$disconnect();
    }
  }, 30_000);
});
