import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { EnrollmentIntegrityError, offeringService } from "./service.ts";

const runDbTests = process.env.ENROLLMENT_INTEGRITY_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

async function expectDatabaseRejection(operation: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

dbDescribe("enrollment academic-evidence integrity", () => {
  test("blocks destructive unenroll/reassignment once academic evidence exists", async () => {
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const spec = await prisma.courseSpec.findFirstOrThrow({
      where: {
        reviewStatus: "Approved",
        assessmentItems: { some: { status: "Active" } },
      },
      include: {
        assessmentItems: {
          where: { status: "Active" },
          orderBy: { order: "asc" },
        },
      },
    });
    const assessment = spec.assessmentItems[0];
    if (!assessment) throw new Error("Seeded approved CourseSpec needs an active assessment");

    const term = `issue1243-${suffix}`;
    const source = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        courseSpecId: spec.id,
        lecturerId: actor.id,
        term,
        sectionCode: "I1243-A",
        capacity: 10,
        status: "Planned",
        semester: "First",
        programmeYear: 3,
      },
    });
    const target = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        courseSpecId: spec.id,
        lecturerId: actor.id,
        term,
        sectionCode: "I1243-B",
        capacity: 10,
        status: "Planned",
        semester: "First",
        programmeYear: 3,
      },
    });

    const resultStudent = await prisma.student.create({
      data: {
        name: "Issue 1243 Result Student",
        email: `issue1243-result-${suffix}@dse.invalid`,
        studentId: `I1243-R-${suffix}`,
        status: "Active",
      },
    });
    const resultEnrollment = await prisma.enrollment.create({
      data: { offeringId: source.id, studentId: resultStudent.id },
    });
    await prisma.assessmentResult.create({
      data: {
        enrollmentId: resultEnrollment.id,
        courseSpecId: spec.id,
        assessmentItemId: assessment.id,
        score: 70,
        maxScore: 100,
        feedback: "Draft academic evidence",
      },
    });

    await expect(
      offeringService.unenroll(source.id, resultStudent.id),
    ).rejects.toBeInstanceOf(EnrollmentIntegrityError);
    await expectDatabaseRejection(() =>
      prisma.enrollment.delete({ where: { id: resultEnrollment.id } }),
    );
    await expectDatabaseRejection(() =>
      prisma.enrollment.update({
        where: { id: resultEnrollment.id },
        data: { offeringId: target.id },
      }),
    );
    expect(
      await prisma.assessmentResult.count({
        where: { enrollmentId: resultEnrollment.id },
      }),
    ).toBe(1);

    const attendanceStudent = await prisma.student.create({
      data: {
        name: "Issue 1243 Attendance Student",
        email: `issue1243-attendance-${suffix}@dse.invalid`,
        studentId: `I1243-A-${suffix}`,
        status: "Active",
      },
    });
    const attendanceEnrollment = await prisma.enrollment.create({
      data: { offeringId: source.id, studentId: attendanceStudent.id },
    });
    const attendanceSessionId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "pms_attendance"."AttendanceSession"
        ("id", "offeringId", "sessionDate", "checkpointTrackingStartedAt")
      VALUES (
        ${attendanceSessionId},
        ${source.id},
        ${new Date("2026-10-05T00:00:00.000Z")},
        CURRENT_TIMESTAMP
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO "pms_attendance"."AttendanceRecord"
        ("sessionId", "studentId", "studentNumber", "studentName", "status", "note")
      VALUES (
        ${attendanceSessionId},
        ${attendanceStudent.id},
        ${attendanceStudent.studentId},
        ${attendanceStudent.name},
        'Present',
        'Integrity test'
      )
    `;

    await prisma.enrollment.delete({ where: { id: attendanceEnrollment.id } });
    expect(
      await prisma.enrollment.findUnique({ where: { id: attendanceEnrollment.id } }),
    ).toBeNull();
    const attendanceRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."AttendanceRecord"
      WHERE "sessionId" = ${attendanceSessionId}
        AND "studentId" = ${attendanceStudent.id}
    `;
    expect(Number(attendanceRows[0]?.count ?? 0n)).toBe(1);

    const plainStudent = await prisma.student.create({
      data: {
        name: "Issue 1243 Plain Student",
        email: `issue1243-plain-${suffix}@dse.invalid`,
        studentId: `I1243-P-${suffix}`,
        status: "Active",
      },
    });
    const plainEnrollment = await prisma.enrollment.create({
      data: { offeringId: source.id, studentId: plainStudent.id },
    });
    await expectDatabaseRejection(() =>
      prisma.enrollment.update({
        where: { id: plainEnrollment.id },
        data: { offeringId: target.id },
      }),
    );
    await prisma.enrollment.delete({ where: { id: plainEnrollment.id } });
    expect(
      await prisma.enrollment.findUnique({ where: { id: plainEnrollment.id } }),
    ).toBeNull();

    const completed = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        courseSpecId: spec.id,
        lecturerId: actor.id,
        term: `${term}-completed`,
        sectionCode: "I1243-C",
        capacity: 10,
        status: "Planned",
        semester: "First",
        programmeYear: 3,
      },
    });
    const completedStudent = await prisma.student.create({
      data: {
        name: "Issue 1243 Completed Student",
        email: `issue1243-completed-${suffix}@dse.invalid`,
        studentId: `I1243-C-${suffix}`,
        status: "Active",
      },
    });
    const completedEnrollment = await prisma.enrollment.create({
      data: { offeringId: completed.id, studentId: completedStudent.id },
    });
    await prisma.offering.update({
      where: { id: completed.id },
      data: { status: "Completed" },
    });

    await expectDatabaseRejection(() =>
      prisma.enrollment.delete({ where: { id: completedEnrollment.id } }),
    );
    await expectDatabaseRejection(() =>
      prisma.offering.delete({ where: { id: completed.id } }),
    );
    expect(
      await prisma.enrollment.findUnique({ where: { id: completedEnrollment.id } }),
    ).not.toBeNull();

    const lateStudent = await prisma.student.create({
      data: {
        name: "Issue 1243 Late Completed Student",
        email: `issue1243-late-${suffix}@dse.invalid`,
        studentId: `I1243-L-${suffix}`,
        status: "Active",
      },
    });
    await expectDatabaseRejection(() =>
      prisma.enrollment.create({
        data: { offeringId: completed.id, studentId: lateStudent.id },
      }),
    );

    const capacityOffering = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        courseSpecId: spec.id,
        lecturerId: actor.id,
        term: `${term}-capacity`,
        sectionCode: "I1243-CAP",
        capacity: 1,
        status: "Planned",
        semester: "First",
        programmeYear: 3,
      },
    });
    const [capacityStudentOne, capacityStudentTwo] = await Promise.all([
      prisma.student.create({
        data: {
          name: "Issue 1243 Capacity Student One",
          email: `issue1243-cap1-${suffix}@dse.invalid`,
          studentId: `I1243-CP1-${suffix}`,
          status: "Active",
        },
      }),
      prisma.student.create({
        data: {
          name: "Issue 1243 Capacity Student Two",
          email: `issue1243-cap2-${suffix}@dse.invalid`,
          studentId: `I1243-CP2-${suffix}`,
          status: "Active",
        },
      }),
    ]);
    await prisma.enrollment.create({
      data: { offeringId: capacityOffering.id, studentId: capacityStudentOne.id },
    });
    await expectDatabaseRejection(() =>
      prisma.enrollment.create({
        data: { offeringId: capacityOffering.id, studentId: capacityStudentTwo.id },
      }),
    );
    expect(
      await prisma.enrollment.count({ where: { offeringId: capacityOffering.id } }),
    ).toBe(1);
  });

  test("keeps placement-correction history append-only", async () => {
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const course = await prisma.course.findFirstOrThrow({ select: { id: true } });
    const student = await prisma.student.create({
      data: {
        name: "Issue 1243 Audit Student",
        email: `issue1243-audit-${suffix}@dse.invalid`,
        studentId: `I1243-H-${suffix}`,
        status: "Active",
      },
    });
    const [from, to] = await Promise.all([
      prisma.offering.create({
        data: {
          courseId: course.id,
          lecturerId: actor.id,
          term: `issue1243-audit-${suffix}`,
          sectionCode: "I1243-D",
          capacity: 10,
          status: "Planned",
        },
      }),
      prisma.offering.create({
        data: {
          courseId: course.id,
          lecturerId: actor.id,
          term: `issue1243-audit-${suffix}`,
          sectionCode: "I1243-E",
          capacity: 10,
          status: "Planned",
        },
      }),
    ]);
    const correction = await prisma.enrollmentPlacementCorrection.create({
      data: {
        enrollmentId: randomUUID(),
        studentId: student.id,
        fromOfferingId: from.id,
        toOfferingId: to.id,
        correctedById: actor.id,
        reason: "Wrong class section",
      },
    });

    await expectDatabaseRejection(() =>
      prisma.enrollmentPlacementCorrection.update({
        where: { id: correction.id },
        data: { reason: "Rewritten reason" },
      }),
    );
    await expectDatabaseRejection(() =>
      prisma.enrollmentPlacementCorrection.delete({ where: { id: correction.id } }),
    );
  });
});
