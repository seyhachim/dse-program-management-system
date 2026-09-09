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
    const canonicalTerm = `${academicYear.label}-S1`;

    const moveTarget = await academicCalendarService.createCalendar(course.programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Integrity move target",
      studyYears: [3],
      periods: [{ semester: "Second", teachingStart: "2199-02-01", teachingEnd: "2199-05-30" }],
      events: [],
      sourceTitle: "Draft move target",
      sourcePublishedAt: null,
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Draft only",
    });
    let publishedChildMoveRejected = false;
    try {
      await prisma.academicCalendarPeriod.update({ where: { id: originalPeriod.id }, data: { calendarId: moveTarget.id } });
    } catch {
      publishedChildMoveRejected = true;
    }
    expect(publishedChildMoveRejected).toBe(true);

    const active = await prisma.offering.create({
      data: {
        courseId: course.id,
        term: canonicalTerm,
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
        term: canonicalTerm,
        sectionCode: "B",
        capacity: 30,
        status: "Completed",
        semester: "First",
        programmeYear: 3,
        academicCalendarPeriodId: originalPeriod.id,
      },
    });

    let semesterMismatchRejected = false;
    try {
      await prisma.offering.update({ where: { id: active.id }, data: { semester: "Second" } });
    } catch {
      semesterMismatchRejected = true;
    }
    expect(semesterMismatchRejected).toBe(true);

    let studyYearMismatchRejected = false;
    try {
      await prisma.offering.update({ where: { id: active.id }, data: { programmeYear: 2 } });
    } catch {
      studyYearMismatchRejected = true;
    }
    expect(studyYearMismatchRejected).toBe(true);

    let detachRejected = false;
    try {
      await prisma.offering.update({ where: { id: active.id }, data: { academicCalendarPeriodId: null } });
    } catch {
      detachRejected = true;
    }
    expect(detachRejected).toBe(true);

    let termTamperRejected = false;
    try {
      await prisma.offering.update({ where: { id: active.id }, data: { term: "tampered-term" } });
    } catch {
      termTamperRejected = true;
    }
    expect(termTamperRejected).toBe(true);

    let draftPeriodLinkRejected = false;
    try {
      await prisma.offering.update({
        where: { id: active.id },
        data: { academicCalendarPeriodId: moveTarget.periods[0]!.id, semester: "Second", term: `${academicYear.label}-S2` },
      });
    } catch {
      draftPeriodLinkRejected = true;
    }
    expect(draftPeriodLinkRejected).toBe(true);

    const foreignProgrammeId = `calendar-foreign-${suffix}`;
    await prisma.programme.create({ data: { id: foreignProgrammeId, code: `FC-${suffix.slice(0, 8)}`, name: "Foreign Calendar Programme", status: "active" } });
    const foreignYear = await academicCalendarService.createAcademicYear(foreignProgrammeId, {
      label: `2198-2199-foreign-${suffix.slice(0, 8)}`, startYear: 2198, endYear: 2199, isCurrent: false,
    });
    const foreignDraft = await academicCalendarService.createCalendar(foreignProgrammeId, actor.id, {
      academicYearId: foreignYear.id, revisionReason: "Foreign official issue", studyYears: [3],
      periods: [{ semester: "First", teachingStart: "2198-09-01", teachingEnd: "2199-01-15" }], events: [],
      sourceTitle: "Foreign official calendar", sourcePublishedAt: "2198-08-01", sourceUrl: null, sourceFileRef: null, sourceNote: "Official test source",
    });
    const foreignPublished = await academicCalendarService.publishCalendar(foreignProgrammeId, foreignDraft.id, actor.id);
    let crossProgrammeLinkRejected = false;
    try {
      await prisma.offering.update({
        where: { id: active.id },
        data: { academicCalendarPeriodId: foreignPublished.periods[0]!.id, term: `${foreignYear.label}-S1` },
      });
    } catch {
      crossProgrammeLinkRejected = true;
    }
    expect(crossProgrammeLinkRejected).toBe(true);

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
      sourceFileRef: `internal/calendar/${suffix}.pdf`,
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

    let completedRebindRejected = false;
    try {
      await prisma.offering.update({ where: { id: completed.id }, data: { academicCalendarPeriodId: replacementPeriod.id } });
    } catch {
      completedRebindRejected = true;
    }
    expect(completedRebindRejected).toBe(true);

    let shadowDatesRejected = false;
    try {
      await prisma.offering.update({ where: { id: active.id }, data: { startDate: new Date("2198-09-09T00:00:00.000Z") } });
    } catch {
      shadowDatesRejected = true;
    }
    expect(shadowDatesRejected).toBe(true);

    let auditRewriteRejected = false;
    try {
      await prisma.academicCalendarAuditAction.update({ where: { id: audit[0]!.id }, data: { reason: "rewritten" } });
    } catch {
      auditRewriteRejected = true;
    }
    expect(auditRewriteRejected).toBe(true);

    const projection = await academicCalendarService.publishedProjection(course.programmeId, 3, academicYear.label);
    expect(projection.status).toBe("available");
    if (projection.status === "available") {
      expect(projection.sources.length).toBeGreaterThan(0);
      expect("fileRef" in projection.sources[0]!).toBe(false);
    }
  });

  test("keeps a published teaching period usable for Planned setup while curriculum is pending", async () => {
    const suffix = randomUUID();
    const programmeId = `calendar-pending-${suffix}`;
    await prisma.programme.create({
      data: {
        id: programmeId,
        code: `CP-${suffix.slice(0, 8)}`,
        name: "Pending Curriculum Programme",
        status: "active",
      },
    });
    const actor = await prisma.user.create({
      data: { email: `calendar-pending-${suffix}@dse.invalid`, name: "Pending Curriculum Coordinator" },
    });
    const course = await prisma.course.create({
      data: {
        programmeId,
        code: `PC-${suffix.slice(0, 8)}`,
        title: "Provisional planning course",
      },
    });
    const academicYear = await academicCalendarService.createAcademicYear(programmeId, {
      label: `2197-2198-${suffix.slice(0, 8)}`,
      startYear: 2197,
      endYear: 2198,
      isCurrent: false,
    });
    const draft = await academicCalendarService.createCalendar(programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Official calendar before curriculum confirmation",
      studyYears: [3],
      periods: [{ semester: "First", teachingStart: "2197-09-01", teachingEnd: "2198-01-15" }],
      events: [],
      sourceTitle: "Official pending-curriculum calendar",
      sourcePublishedAt: "2197-08-01",
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Official test source",
    });
    await academicCalendarService.publishCalendar(programmeId, draft.id, actor.id);

    const context = await academicCalendarService.context(programmeId, {
      academicYearId: academicYear.id,
      studyYear: 3,
      semester: "First",
    });
    expect(context.period.semester).toBe("First");
    expect(context.curriculum.status).toBe("pending");
    expect(context.courses).toEqual([]);

    const resolution = await academicCalendarService.resolveCoursePlacement(
      programmeId,
      academicYear.id,
      3,
      "First",
      course.id,
    );
    expect(resolution.status).toBe("curriculum-pending");
  });
});
