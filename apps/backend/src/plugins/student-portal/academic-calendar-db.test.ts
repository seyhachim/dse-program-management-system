import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { academicCalendarService } from "../programme/academic-calendar-service.ts";
import { programmePlugin } from "../programme/index.ts";
import { studentPortalService } from "./service.ts";

const runDbTests = process.env.ACADEMIC_CALENDAR_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("Student Portal Academic Calendar publication boundary", () => {
  test("uses authoritative progression, does not fall back across study years, and never leaks Draft calendars", async () => {
    if (!registry.has("programme")) registry.register(programmePlugin);

    const suffix = randomUUID();
    const programmeId = `calendar-${suffix}`;
    const actor = await prisma.user.create({
      data: { email: `calendar-actor-${suffix}@dse.invalid`, name: "Calendar Test Coordinator" },
    });
    const studentUser = await prisma.user.create({
      data: { email: `calendar-student-${suffix}@dse.invalid`, name: "Calendar Test Student" },
    });
    await prisma.programme.create({
      data: { id: programmeId, code: `CAL-${suffix.slice(0, 8)}`, name: "Calendar Test Programme", status: "active" },
    });
    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        name: studentUser.name,
        email: studentUser.email,
        studentId: `CAL-S-${suffix}`,
        status: "Active",
      },
    });
    const cohort = await prisma.studentCohort.create({
      data: {
        programmeId,
        code: `COH-${suffix.slice(0, 8)}`,
        name: "Calendar Test Cohort",
        intakeYear: 2024,
        expectedGraduationYear: 2028,
        status: "Active",
      },
    });
    const membership = await prisma.studentCohortMembership.create({
      data: {
        cohortId: cohort.id,
        studentId: student.id,
        joinedAt: new Date("2024-09-01T00:00:00.000Z"),
      },
    });

    const academicYear = await academicCalendarService.createAcademicYear(programmeId, {
      label: "2026-2027",
      startYear: 2026,
      endYear: 2027,
      isCurrent: true,
    });
    const publishedYear3 = await academicCalendarService.createCalendar(programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Initial official issue",
      studyYears: [3],
      periods: [{ semester: "First", teachingStart: "2026-09-16", teachingEnd: "2027-01-16" }],
      events: [{ title: "Final examinations", type: "FinalExam", semester: "First", startDate: "2027-01-24", endDate: "2027-01-30", note: "", sortOrder: 0 }],
      sourceTitle: "Official Year 3 Calendar",
      sourcePublishedAt: "2026-08-20",
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Issued by the university registrar",
    });
    await academicCalendarService.publishCalendar(programmeId, publishedYear3.id, actor.id);

    await academicCalendarService.createCalendar(programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Draft only",
      studyYears: [4],
      periods: [{ semester: "First", teachingStart: "2026-09-20", teachingEnd: "2027-01-20" }],
      events: [],
      sourceTitle: "Draft Year 4 Calendar",
      sourcePublishedAt: null,
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Not published",
    });

    await prisma.studentProgressionRecord.create({
      data: {
        membershipId: membership.id,
        academicYear: academicYear.label,
        term: "S1",
        programmeYear: 4,
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2027-01-31T00:00:00.000Z"),
        status: "Progressed",
      },
    });

    const unavailable = await studentPortalService.academicCalendar(studentUser.id);
    expect(unavailable.status).toBe("unavailable");
    if (unavailable.status === "unavailable") {
      expect(unavailable.studyYear).toBe(4);
      expect(unavailable.reason).toBe("calendar-unpublished");
    }

    await prisma.studentProgressionRecord.create({
      data: {
        membershipId: membership.id,
        academicYear: academicYear.label,
        term: "S2",
        programmeYear: 3,
        periodStart: new Date("2027-02-01T00:00:00.000Z"),
        periodEnd: new Date("2027-06-30T00:00:00.000Z"),
        status: "Progressed",
      },
    });

    const available = await studentPortalService.academicCalendar(studentUser.id);
    expect(available.status).toBe("available");
    if (available.status === "available") {
      expect(available.studyYear).toBe(3);
      expect(available.academicYear.label).toBe("2026-2027");
      expect(available.periods).toHaveLength(1);
      expect(available.periods[0]?.teachingStart).toBe("2026-09-16");
      expect(available.nextEvent?.title).toBe("Final examinations");
    }
  });
});
