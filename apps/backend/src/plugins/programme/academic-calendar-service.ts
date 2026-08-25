import { randomUUID } from "node:crypto";
import type {
  AcademicCalendarContextQuery, AcademicCalendarContextView, AcademicCalendarOfferingPeriodRef,
  AcademicCalendarPeriodInput, AcademicCalendarPeriodView, AcademicCalendarEventInput, AcademicCalendarEventView,
  AcademicCalendarView, AcademicYearView, CreateAcademicCalendarInput, CreateAcademicYearInput,
  PublishedAcademicCalendarProjection, UpdateAcademicCalendarDraftInput, AcademicCalendarTimelineEvent,
} from "@dse-pms/shared-types";
import { Prisma, type AcademicCalendarEventType, type Semester } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

export class AcademicCalendarNotFoundError extends Error {}
export class AcademicCalendarConflictError extends Error {}
export class AcademicCalendarValidationError extends Error {}
export class AcademicCalendarImmutableError extends Error {}

const calendarInclude = { academicYear: true, studyYears: true, periods: { orderBy: { semester: "asc" as const } }, events: { orderBy: [{ startDate: "asc" as const }, { sortOrder: "asc" as const }] } } satisfies Prisma.AcademicCalendarInclude;
type CalendarRow = Prisma.AcademicCalendarGetPayload<{ include: typeof calendarInclude }>;

const dbDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : null;
const dateOnly = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 10) : null;
const iso = (value: Date) => value.toISOString();

function yearView(row: { id: string; programmeId: string; label: string; startYear: number; endYear: number; isCurrent: boolean; createdAt: Date; updatedAt: Date }): AcademicYearView {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function periodView(row: CalendarRow["periods"][number]): AcademicCalendarPeriodView {
  return { id: row.id, calendarId: row.calendarId, semester: row.semester, teachingStart: dateOnly(row.teachingStart)!, teachingEnd: dateOnly(row.teachingEnd)!, examStart: dateOnly(row.examStart), examEnd: dateOnly(row.examEnd), breakStart: dateOnly(row.breakStart), breakEnd: dateOnly(row.breakEnd) };
}
function eventView(row: CalendarRow["events"][number]): AcademicCalendarEventView {
  return { id: row.id, calendarId: row.calendarId, title: row.title, type: row.type, semester: row.semester, startDate: dateOnly(row.startDate)!, endDate: dateOnly(row.endDate), note: row.note, sortOrder: row.sortOrder };
}
function calendarView(row: CalendarRow): AcademicCalendarView {
  return {
    id: row.id, academicYear: yearView(row.academicYear), seriesKey: row.seriesKey, revision: row.revision, status: row.status,
    studyYears: row.studyYears.map((item) => item.studyYear).sort((a, b) => a - b), periods: row.periods.map(periodView), events: row.events.map(eventView),
    source: { title: row.sourceTitle, publishedAt: dateOnly(row.sourcePublishedAt), url: row.sourceUrl, fileRef: row.sourceFileRef, note: row.sourceNote },
    revisionReason: row.revisionReason, supersedesCalendarId: row.supersedesCalendarId, publishedAt: row.publishedAt?.toISOString() ?? null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
  };
}

function periodCreate(period: AcademicCalendarPeriodInput) {
  return { semester: period.semester as Semester, teachingStart: dbDate(period.teachingStart)!, teachingEnd: dbDate(period.teachingEnd)!, examStart: dbDate(period.examStart), examEnd: dbDate(period.examEnd), breakStart: dbDate(period.breakStart), breakEnd: dbDate(period.breakEnd) };
}
function eventCreate(event: AcademicCalendarEventInput) {
  return { title: event.title, type: event.type as AcademicCalendarEventType, semester: (event.semester ?? null) as Semester | null, startDate: dbDate(event.startDate)!, endDate: dbDate(event.endDate), note: event.note, sortOrder: event.sortOrder };
}
function sourceData(input: Pick<CreateAcademicCalendarInput, "sourceTitle" | "sourcePublishedAt" | "sourceUrl" | "sourceFileRef" | "sourceNote">) {
  return { sourceTitle: input.sourceTitle, sourcePublishedAt: dbDate(input.sourcePublishedAt), sourceUrl: input.sourceUrl || null, sourceFileRef: input.sourceFileRef || null, sourceNote: input.sourceNote };
}
async function requireYear(programmeId: string, academicYearId: string) {
  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, programmeId } });
  if (!year) throw new AcademicCalendarNotFoundError("Academic year not found for this programme");
  return year;
}
async function requireCalendar(programmeId: string, calendarId: string): Promise<CalendarRow> {
  const row = await prisma.academicCalendar.findFirst({ where: { id: calendarId, academicYear: { programmeId } }, include: calendarInclude });
  if (!row) throw new AcademicCalendarNotFoundError("Academic calendar not found for this programme");
  return row;
}
function requireDraft(row: CalendarRow) { if (row.status !== "Draft") throw new AcademicCalendarImmutableError("Published or historical calendars are immutable; create a revision instead"); }
function requirePublishable(row: CalendarRow) {
  if (!row.sourceTitle.trim()) throw new AcademicCalendarValidationError("Official source title is required before publishing");
  if (!(row.sourceUrl?.trim() || row.sourceFileRef?.trim() || row.sourceNote.trim())) throw new AcademicCalendarValidationError("Add a source URL, managed file reference, or source note before publishing");
  if (row.studyYears.length === 0 || row.periods.length === 0) throw new AcademicCalendarValidationError("A published calendar needs at least one study year and semester period");
}

export function buildAcademicCalendarTimeline(periods: AcademicCalendarPeriodView[], events: AcademicCalendarEventView[], today = new Date().toISOString().slice(0, 10)): AcademicCalendarTimelineEvent[] {
  const synthesized = periods.flatMap((period): AcademicCalendarTimelineEvent[] => {
    const semesterLabel = period.semester === "First" ? "Semester 1" : "Semester 2";
    const rows: AcademicCalendarTimelineEvent[] = [{ key: `period:${period.id}:teaching`, title: `${semesterLabel} teaching`, type: "Teaching", semester: period.semester, startDate: period.teachingStart, endDate: period.teachingEnd, note: "" }];
    if (period.examStart && period.examEnd) rows.push({ key: `period:${period.id}:exam`, title: `${semesterLabel} examinations`, type: "FinalExam", semester: period.semester, startDate: period.examStart, endDate: period.examEnd, note: "" });
    if (period.breakStart && period.breakEnd) rows.push({ key: `period:${period.id}:break`, title: `${semesterLabel} break`, type: "SemesterBreak", semester: period.semester, startDate: period.breakStart, endDate: period.breakEnd, note: "" });
    return rows;
  });
  const explicit = events.map((event) => ({ key: `event:${event.id}`, title: event.title, type: event.type, semester: event.semester, startDate: event.startDate, endDate: event.endDate, note: event.note }));
  return [...synthesized, ...explicit].filter((event) => (event.endDate ?? event.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

export const academicCalendarService = {
  async listAcademicYears(programmeId: string): Promise<AcademicYearView[]> {
    const rows = await prisma.academicYear.findMany({ where: { programmeId }, orderBy: [{ startYear: "desc" }, { label: "desc" }] });
    return rows.map(yearView);
  },
  async createAcademicYear(programmeId: string, input: CreateAcademicYearInput): Promise<AcademicYearView> {
    const programme = await prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true } });
    if (!programme) throw new AcademicCalendarNotFoundError("Programme not found");
    try {
      const row = await prisma.$transaction(async (tx) => {
        if (input.isCurrent) await tx.academicYear.updateMany({ where: { programmeId, isCurrent: true }, data: { isCurrent: false } });
        return tx.academicYear.create({ data: { programmeId, ...input } });
      });
      return yearView(row);
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AcademicCalendarConflictError("That academic year already exists"); throw error; }
  },
  async setCurrentAcademicYear(programmeId: string, academicYearId: string): Promise<AcademicYearView> {
    await requireYear(programmeId, academicYearId);
    const row = await prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ where: { programmeId, isCurrent: true, NOT: { id: academicYearId } }, data: { isCurrent: false } });
      return tx.academicYear.update({ where: { id: academicYearId }, data: { isCurrent: true } });
    });
    return yearView(row);
  },
  async listCalendars(programmeId: string, academicYearId: string): Promise<AcademicCalendarView[]> {
    await requireYear(programmeId, academicYearId);
    const rows = await prisma.academicCalendar.findMany({ where: { academicYearId }, include: calendarInclude, orderBy: [{ createdAt: "desc" }] });
    return rows.map(calendarView);
  },
  async getCalendar(programmeId: string, calendarId: string): Promise<AcademicCalendarView> { return calendarView(await requireCalendar(programmeId, calendarId)); },
  async createCalendar(programmeId: string, actorId: string, input: CreateAcademicCalendarInput): Promise<AcademicCalendarView> {
    await requireYear(programmeId, input.academicYearId);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.academicCalendar.create({ data: { academicYearId: input.academicYearId, seriesKey: randomUUID(), revision: 1, revisionReason: input.revisionReason, createdById: actorId, ...sourceData(input), studyYears: { create: input.studyYears.map((studyYear) => ({ studyYear })) }, periods: { create: input.periods.map(periodCreate) }, events: { create: input.events.map(eventCreate) } }, include: calendarInclude });
      await tx.academicCalendarAuditAction.create({ data: { calendarId: created.id, actorId, action: "Created", afterSnapshot: calendarView(created) as unknown as Prisma.InputJsonValue } });
      return created;
    });
    return calendarView(row);
  },
  async updateDraft(programmeId: string, calendarId: string, actorId: string, input: UpdateAcademicCalendarDraftInput): Promise<AcademicCalendarView> {
    const existing = await requireCalendar(programmeId, calendarId); requireDraft(existing); const before = calendarView(existing);
    const row = await prisma.$transaction(async (tx) => {
      await tx.academicCalendarStudyYear.deleteMany({ where: { calendarId } });
      await tx.academicCalendarPeriod.deleteMany({ where: { calendarId } });
      await tx.academicCalendarEvent.deleteMany({ where: { calendarId } });
      const updated = await tx.academicCalendar.update({ where: { id: calendarId }, data: { ...sourceData(input), studyYears: { create: input.studyYears.map((studyYear) => ({ studyYear })) }, periods: { create: input.periods.map(periodCreate) }, events: { create: input.events.map(eventCreate) } }, include: calendarInclude });
      await tx.academicCalendarAuditAction.create({ data: { calendarId, actorId, action: "Updated", beforeSnapshot: before as unknown as Prisma.InputJsonValue, afterSnapshot: calendarView(updated) as unknown as Prisma.InputJsonValue } });
      return updated;
    });
    return calendarView(row);
  },
  async createRevision(programmeId: string, calendarId: string, actorId: string, reason: string): Promise<AcademicCalendarView> {
    const source = await requireCalendar(programmeId, calendarId);
    if (source.status !== "Published") throw new AcademicCalendarValidationError("Only the currently published calendar can start a correction revision");
    const maxRevision = await prisma.academicCalendar.aggregate({ where: { academicYearId: source.academicYearId, seriesKey: source.seriesKey }, _max: { revision: true } });
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.academicCalendar.create({ data: { academicYearId: source.academicYearId, seriesKey: source.seriesKey, revision: (maxRevision._max.revision ?? source.revision) + 1, status: "Draft", sourceTitle: source.sourceTitle, sourcePublishedAt: source.sourcePublishedAt, sourceUrl: source.sourceUrl, sourceFileRef: source.sourceFileRef, sourceNote: source.sourceNote, revisionReason: reason, supersedesCalendarId: source.id, createdById: actorId, studyYears: { create: source.studyYears.map((item) => ({ studyYear: item.studyYear })) }, periods: { create: source.periods.map((period) => ({ semester: period.semester, teachingStart: period.teachingStart, teachingEnd: period.teachingEnd, examStart: period.examStart, examEnd: period.examEnd, breakStart: period.breakStart, breakEnd: period.breakEnd })) }, events: { create: source.events.map((event) => ({ title: event.title, type: event.type, semester: event.semester, startDate: event.startDate, endDate: event.endDate, note: event.note, sortOrder: event.sortOrder })) } }, include: calendarInclude });
      await tx.academicCalendarAuditAction.create({ data: { calendarId: created.id, actorId, action: "RevisionCreated", reason, details: { supersedesCalendarId: source.id } } });
      return created;
    });
    return calendarView(row);
  },
  async publishCalendar(programmeId: string, calendarId: string, actorId: string): Promise<AcademicCalendarView> {
    const draft = await requireCalendar(programmeId, calendarId); requireDraft(draft); requirePublishable(draft);
    const semesters = draft.periods.map((period) => period.semester); const studyYears = draft.studyYears.map((item) => item.studyYear);
    const conflict = await prisma.academicCalendar.findFirst({ where: { id: { notIn: [draft.id, ...(draft.supersedesCalendarId ? [draft.supersedesCalendarId] : [])] }, academicYearId: draft.academicYearId, status: "Published", studyYears: { some: { studyYear: { in: studyYears } } }, periods: { some: { semester: { in: semesters } } } }, select: { id: true } });
    if (conflict) throw new AcademicCalendarConflictError("A published calendar already covers one of these study-year and semester combinations");
    const row = await prisma.$transaction(async (tx) => {
      let reboundCount = 0;
      if (draft.supersedesCalendarId) {
        const predecessor = await tx.academicCalendar.findUnique({ where: { id: draft.supersedesCalendarId }, include: { periods: true } });
        if (!predecessor || predecessor.status !== "Published") throw new AcademicCalendarConflictError("The calendar being revised is no longer the published revision");
        await tx.academicCalendar.update({ where: { id: predecessor.id }, data: { status: "Superseded" } });
        await tx.academicCalendarAuditAction.create({ data: { calendarId: predecessor.id, actorId, action: "Superseded", reason: draft.revisionReason, details: { supersededByCalendarId: draft.id } } });
        for (const oldPeriod of predecessor.periods) {
          const newPeriod = draft.periods.find((period) => period.semester === oldPeriod.semester);
          if (!newPeriod) continue;
          const result = await tx.offering.updateMany({ where: { academicCalendarPeriodId: oldPeriod.id, status: { in: ["Planned", "Active"] } }, data: { academicCalendarPeriodId: newPeriod.id, semester: newPeriod.semester, startDate: null, endDate: null } });
          reboundCount += result.count;
        }
      }
      const published = await tx.academicCalendar.update({ where: { id: draft.id }, data: { status: "Published", publishedById: actorId, publishedAt: new Date() }, include: calendarInclude });
      await tx.academicCalendarAuditAction.create({ data: { calendarId: draft.id, actorId, action: "Published", reason: draft.revisionReason, afterSnapshot: calendarView(published) as unknown as Prisma.InputJsonValue, details: { reboundOfferingCount: reboundCount } } });
      if (reboundCount > 0) await tx.academicCalendarAuditAction.create({ data: { calendarId: draft.id, actorId, action: "OfferingRebound", reason: "Active/planned offerings follow the newly published canonical revision", details: { count: reboundCount } } });
      return published;
    });
    return calendarView(row);
  },
  async archiveDraft(programmeId: string, calendarId: string, actorId: string): Promise<AcademicCalendarView> {
    const row = await requireCalendar(programmeId, calendarId); requireDraft(row);
    const updated = await prisma.$transaction(async (tx) => {
      const archived = await tx.academicCalendar.update({ where: { id: calendarId }, data: { status: "Archived" }, include: calendarInclude });
      await tx.academicCalendarAuditAction.create({ data: { calendarId, actorId, action: "Archived" } });
      return archived;
    });
    return calendarView(updated);
  },
  async resolvePublishedPeriod(programmeId: string, query: AcademicCalendarContextQuery) {
    const rows = await prisma.academicCalendar.findMany({ where: { academicYearId: query.academicYearId, academicYear: { programmeId }, status: "Published", studyYears: { some: { studyYear: query.studyYear } }, periods: { some: { semester: query.semester as Semester } } }, include: calendarInclude });
    if (rows.length > 1) throw new AcademicCalendarConflictError("Multiple published calendar periods match this academic context");
    const row = rows[0]; if (!row) return null;
    const period = row.periods.find((item) => item.semester === query.semester);
    return period ? { calendar: row, period } : null;
  },
  async listCurriculumCourseOptions(programmeId: string, academicYearId: string, studyYear: number, semester: "First" | "Second") {
    const year = await requireYear(programmeId, academicYearId);
    const active = await prisma.programmeCurriculumVersion.findMany({ where: { status: "Active", curriculum: { programmeId } }, select: { id: true, academicYear: true } });
    let chosen: { id: string; academicYear: string } | null = null;
    if (active.length === 1) chosen = active[0]!;
    else if (active.length > 1) { const exact = active.filter((version) => version.academicYear === year.label); if (exact.length === 1) chosen = exact[0]!; else throw new AcademicCalendarConflictError("Multiple active curriculum versions match this programme; resolve curriculum publication before creating offerings"); }
    if (!chosen) {
      const approved = await prisma.programmeCurriculumVersion.findMany({ where: { status: "Approved", academicYear: year.label, curriculum: { programmeId } }, select: { id: true, academicYear: true } });
      if (approved.length === 1) chosen = approved[0]!;
      else if (approved.length > 1) throw new AcademicCalendarConflictError("Multiple approved curriculum versions match this academic year");
      else throw new AcademicCalendarNotFoundError("No active or uniquely approved curriculum version is available for this academic year");
    }
    const placements = await prisma.programmeCurriculumCourse.findMany({ where: { curriculumVersionId: chosen.id, yearLevel: studyYear, semester: semester as Semester }, include: { course: { select: { id: true, code: true, title: true, credits: true, courseType: true } } }, orderBy: [{ sortOrder: "asc" }, { course: { code: "asc" } }] });
    return placements.map((placement) => ({ ...placement.course, curriculumVersionId: chosen!.id }));
  },
  async context(programmeId: string, query: AcademicCalendarContextQuery): Promise<AcademicCalendarContextView> {
    const year = await requireYear(programmeId, query.academicYearId); const resolved = await this.resolvePublishedPeriod(programmeId, query);
    if (!resolved) throw new AcademicCalendarNotFoundError("No published academic calendar exists for Year " + query.studyYear + ", " + (query.semester === "First" ? "Semester 1" : "Semester 2") + ", " + year.label);
    const courses = await this.listCurriculumCourseOptions(programmeId, query.academicYearId, query.studyYear, query.semester);
    return { academicYear: yearView(year), studyYear: query.studyYear, semester: query.semester, calendar: calendarView(resolved.calendar), period: periodView(resolved.period), courses };
  },
  async getPublishedPeriodForOffering(periodId: string, programmeId: string, studyYear: number): Promise<AcademicCalendarOfferingPeriodRef | null> {
    const period = await prisma.academicCalendarPeriod.findFirst({ where: { id: periodId, calendar: { status: "Published", academicYear: { programmeId }, studyYears: { some: { studyYear } } } }, include: { calendar: { include: { academicYear: true, studyYears: true } } } });
    if (!period) return null;
    return { id: period.id, calendarId: period.calendarId, programmeId, academicYearId: period.calendar.academicYearId, academicYearLabel: period.calendar.academicYear.label, studyYears: period.calendar.studyYears.map((item) => item.studyYear), semester: period.semester, teachingStart: dateOnly(period.teachingStart)!, teachingEnd: dateOnly(period.teachingEnd)!, revision: period.calendar.revision };
  },
  async assertCoursePlacement(programmeId: string, academicYearId: string, studyYear: number, semester: "First" | "Second", courseId: string): Promise<void> {
    const options = await this.listCurriculumCourseOptions(programmeId, academicYearId, studyYear, semester);
    if (!options.some((course) => course.id === courseId)) throw new AcademicCalendarValidationError("The selected course is not placed in the applicable curriculum year and semester");
  },
  async publishedProjection(programmeId: string, studyYear: number, academicYearLabel?: string): Promise<PublishedAcademicCalendarProjection> {
    const year = academicYearLabel ? await prisma.academicYear.findFirst({ where: { programmeId, label: academicYearLabel } }) : await prisma.academicYear.findFirst({ where: { programmeId, isCurrent: true } });
    if (!year) return { status: "unavailable", academicYear: null, studyYear, reason: "academic-year-unavailable", message: "No current academic year is configured for this programme." };
    const rows = await prisma.academicCalendar.findMany({ where: { academicYearId: year.id, status: "Published", studyYears: { some: { studyYear } } }, include: calendarInclude, orderBy: [{ publishedAt: "desc" }] });
    if (!rows.length) return { status: "unavailable", academicYear: yearView(year), studyYear, reason: "calendar-unpublished", message: `The official academic calendar for Year ${studyYear} has not yet been published.` };
    const bySemester = new Map<string, AcademicCalendarPeriodView>(); const eventById = new Map<string, AcademicCalendarEventView>(); const sources = new Map<string, AcademicCalendarView["source"]>();
    for (const row of rows) { const view = calendarView(row); for (const period of view.periods) { if (bySemester.has(period.semester)) throw new AcademicCalendarConflictError("Published calendar data contains conflicting semester periods"); bySemester.set(period.semester, period); } for (const event of view.events) eventById.set(event.id, event); sources.set(row.id, view.source); }
    const periods = [...bySemester.values()].sort((a, b) => a.semester.localeCompare(b.semester)); const events = [...eventById.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sortOrder - b.sortOrder); const timeline = buildAcademicCalendarTimeline(periods, events);
    return { status: "available", academicYear: yearView(year), studyYear, periods, events, sources: [...sources.values()], nextEvent: timeline[0] ?? null };
  },
};

export type AcademicCalendarService = typeof academicCalendarService;
