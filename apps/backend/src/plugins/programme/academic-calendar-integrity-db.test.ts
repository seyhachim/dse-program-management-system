import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { academicCalendarService } from "./academic-calendar-service.ts";

const runDbTests = process.env.ACADEMIC_CALENDAR_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("Academic Calendar revision integrity", () => {
  test("rebinds planned/active offerings while completed offerings preserve the historical period", async () => {
    const suffix = randomUUID();
    const course = await prisma.course.findFirstOrThrow({ select: { id: true, programmeId: true } });
    const actor = await prisma.user.create({
      data: { email: `calendar-integrity-${suffix}@dse.invalid`, name: "Calendar Integrity Coordinator" },
    });
    const academicYear = await academicCalendarService.createAcademicYear(course.programmeId, {
      label: `2198-2199-${suffix.slice(0, 8)}`,
      startYear: 2198,
      endYear: 2199,
      isCurrent: false,
    });
    const originalDraft = await academicCalendarService.createCalendar(course.programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Initial official issue",
      studyYears: [3],
      periods: [{ semester: "First", teachingStart: "2198-09-01", teachingEnd: "2199-01-15" }],
      events: [],
      sourceTitle: "Official calendar revision 1",
      sourcePublishedAt: "2198-08-01",
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Official test source",
    });
    const original = await academicCalendarService.publishCalendar(course.programmeId, originalDraft.id, actor.id);
    const originalPeriod = original.periods[0]!;

    const active = await prisma.offering.create({
      data: {
        courseId: course.id,
        term: `cal-active-${suffix}`,
        sectionCode: "A",
        capacity: 30,
        status: "Active",
        semester: "First",
        programmeYear: 3,
        academicCalendarPeriodId: originalPeriod.id,
      },
    });
    const completed = await prisma.offering.create({
      data: {
        courseId: course.id,
        term: `cal-completed-${suffix}`,
        sectionCode: "A",
        capacity: 30,
        status: "Completed",
        semester: "First",
        programmeYear: 3,
        academicCalendarPeriodId: originalPeriod.id,
      },
    });

    const correction = await academicCalendarService.createRevision(
      course.programmeId,
      original.id,
      actor.id,
      "Registrar corrected the semester dates",
    );
    await academicCalendarService.updateDraft(course.programmeId, correction.id, actor.id, {
      studyYears: [3],
      periods: [{ semester: "First", teachingStart: "2198-09-08", teachingEnd: "2199-01-22" }],
      events: [],
      sourceTitle: "Official calendar correction",
      sourcePublishedAt: "2198-08-15",
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Corrected official test source",
    });
    const publishedCorrection = await academicCalendarService.publishCalendar(course.programmeId, correction.id, actor.id);
    const replacementPeriod = publishedCorrection.periods[0]!;

    const [activeAfter, completedAfter, oldCalendar, audit] = await Promise.all([
      prisma.offering.findUniqueOrThrow({ where: { id: active.id } }),
      prisma.offering.findUniqueOrThrow({ where: { id: completed.id } }),
      prisma.academicCalendar.findUniqueOrThrow({ where: { id: original.id } }),
      prisma.academicCalendarAuditAction.findMany({ where: { calendarId: correction.id } }),
    ]);

    expect(activeAfter.academicCalendarPeriodId).toBe(replacementPeriod.id);
    expect(activeAfter.startDate).toBeNull();
    expect(activeAfter.endDate).toBeNull();
    expect(completedAfter.academicCalendarPeriodId).toBe(originalPeriod.id);
    expect(oldCalendar.status).toBe("Superseded");
    expect(audit.some((row) => row.action === "OfferingRebound")).toBe(true);
  });
});
