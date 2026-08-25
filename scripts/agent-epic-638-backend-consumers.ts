import { readFileSync, writeFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function write(path: string, content: string): void {
  writeFileSync(path, content);
}

function replaceOnce(path: string, before: string, after: string): void {
  const source = read(path);
  if (!source.includes(before)) {
    throw new Error(`Pattern not found in ${path}: ${before.slice(0, 120)}`);
  }
  write(path, source.replace(before, after));
}

function replaceRange(path: string, start: string, end: string, replacement: string): void {
  const source = read(path);
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Start marker not found in ${path}: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`End marker not found in ${path}: ${end}`);
  write(path, source.slice(0, startIndex) + replacement + source.slice(endIndex));
}

// Shared Academic Calendar read/governance contracts.
{
  const path = "packages/shared-types/src/academic-calendar.ts";
  replaceOnce(
    path,
    "export interface AcademicCalendarSourceView { title: string; publishedAt: string | null; url: string | null; fileRef: string | null; note: string; }\n",
    "export interface AcademicCalendarProgrammeRef { id: string; code: string; name: string; }\n" +
      "export interface AcademicCalendarSourceView { title: string; publishedAt: string | null; url: string | null; fileRef: string | null; note: string; }\n" +
      "export interface AcademicCalendarAuditView { id: string; calendarId: string; actorId: string; actorName: string; action: string; reason: string; beforeSnapshot: unknown; afterSnapshot: unknown; details: unknown; createdAt: string; }\n",
  );
  replaceOnce(
    path,
    "export interface AcademicCalendarOfferingPeriodRef { id: string; calendarId: string; programmeId: string; academicYearId: string; academicYearLabel: string; studyYears: number[]; semester: AcademicCalendarSemester; teachingStart: string; teachingEnd: string; revision: number; }\n",
    "export type StudentAcademicCalendarView =\n" +
      "  | { status: \"available\"; academicYear: AcademicYearView; studyYear: number; periods: AcademicCalendarPeriodView[]; events: AcademicCalendarEventView[]; nextEvent: AcademicCalendarTimelineEvent | null; }\n" +
      "  | { status: \"unavailable\"; academicYear: AcademicYearView | null; studyYear: number | null; reason: \"student-context-unavailable\" | \"academic-year-unavailable\" | \"calendar-unpublished\"; message: string; };\n\n" +
      "export interface AcademicCalendarOfferingPeriodRef { id: string; calendarId: string; programmeId: string; academicYearId: string; academicYearLabel: string; studyYears: number[]; semester: AcademicCalendarSemester; teachingStart: string; teachingEnd: string; revision: number; }\n",
  );
}

// Student home shares the exact same student-scoped calendar projection as the full page.
{
  const path = "packages/shared-types/src/student-portal.ts";
  replaceOnce(
    path,
    "import type { MeetingActivityType, MeetingDay } from \"./offerings.ts\";\n",
    "import type { StudentAcademicCalendarView } from \"./academic-calendar.ts\";\nimport type { MeetingActivityType, MeetingDay } from \"./offerings.ts\";\n",
  );
  replaceOnce(
    path,
    "  announcements: PortalAnnouncement[];\n  overallAchievement: number | null;\n}",
    "  announcements: PortalAnnouncement[];\n  academicCalendar: StudentAcademicCalendarView;\n  overallAchievement: number | null;\n}",
  );
}

// Navigation: management calendar and student calendar page.
{
  const path = "packages/shared-types/src/plugins.ts";
  replaceOnce(
    path,
    "    { label: \"Schedule\", path: \"/portal/schedule\", icon: \"calendar\", roles: [\"student\"], group: \"Learning\" },\n",
    "    { label: \"Schedule\", path: \"/portal/schedule\", icon: \"calendar\", roles: [\"student\"], group: \"Learning\" },\n" +
      "    { label: \"Academic Calendar\", path: \"/portal/academic-calendar\", icon: \"calendar\", roles: [\"student\"], group: \"Learning\" },\n",
  );
  replaceOnce(
    path,
    "    {\n      label: \"Programme Management\",\n      path: \"/programme-management\",\n      icon: \"clipboard-list\",\n      roles: [\"admin\", \"program_coordinator\", \"program_secretary\"],\n      group: \"Academic\",\n    },\n",
    "    {\n      label: \"Programme Management\",\n      path: \"/programme-management\",\n      icon: \"clipboard-list\",\n      roles: [\"admin\", \"program_coordinator\", \"program_secretary\"],\n      group: \"Academic\",\n    },\n" +
      "    {\n      label: \"Academic Calendar\",\n      path: \"/academic-calendar\",\n      icon: \"calendar\",\n      roles: [\"admin\", \"program_coordinator\"],\n      group: \"Academic\",\n    },\n",
  );
}

// Offering API contract: new offerings bind to a published calendar period and never accept duplicate canonical dates.
{
  const path = "packages/shared-types/src/offerings.ts";
  replaceOnce(
    path,
    "  // §12 Course Availability — optional. Year is the programme/study year (1–6).\n  semester: SemesterSchema.nullable().optional(),\n  programmeYear: z.coerce.number().int().min(1).max(6).nullable().optional(),\n  // Historical/PATCH compatibility keeps these nullable; CreateOfferingInput below requires both.\n  startDate: DateOnlySchema.nullable().optional(),\n  endDate: DateOnlySchema.nullable().optional(),\n",
    "  // Academic context. New offerings require a published canonical period; nullability remains only for historical PATCH compatibility.\n" +
      "  semester: SemesterSchema.nullable().optional(),\n" +
      "  programmeYear: z.coerce.number().int().min(1).max(6).nullable().optional(),\n" +
      "  academicCalendarPeriodId: z.string().uuid().nullable().optional(),\n" +
      "  // Legacy delivery-date snapshots are retained for historical rows only. New creates must not send them.\n" +
      "  startDate: DateOnlySchema.nullable().optional(),\n  endDate: DateOnlySchema.nullable().optional(),\n",
  );
  replaceRange(
    path,
    "export const CreateOfferingInput = OfferingInputShape.superRefine((data, ctx) => {",
    "export type CreateOfferingInput = z.infer<typeof CreateOfferingInput>;",
    `export const CreateOfferingInput = OfferingInputShape.superRefine((data, ctx) => {
  refineCoLecturers(data, ctx);

  if (!data.lecturerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A primary lecturer is required", path: ["lecturerId"] });
  }
  if (!data.meetings || data.meetings.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add at least one weekly class session", path: ["meetings"] });
  }
  if (!data.academicCalendarPeriodId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A published Academic Calendar period is required", path: ["academicCalendarPeriodId"] });
  }
  if (!data.programmeYear || data.programmeYear < 1 || data.programmeYear > 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Study year must be between 1 and 4", path: ["programmeYear"] });
  }
  if (!data.semester) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Semester is required", path: ["semester"] });
  }
  if (data.startDate !== undefined || data.endDate !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Teaching dates come from the published Academic Calendar and must not be entered on the offering",
      path: ["academicCalendarPeriodId"],
    });
  }
});
`,
  );
  replaceOnce(
    path,
    "  semester: Semester | null;\n  programmeYear: number | null;\n  startDate: string | null;\n  endDate: string | null;\n",
    "  semester: Semester | null;\n  programmeYear: number | null;\n  academicCalendarPeriodId: string | null;\n" +
      "  academicCalendar: { periodId: string; calendarId: string; academicYearId: string; academicYearLabel: string; revision: number; studyYears: number[]; semester: Semester; teachingStart: string; teachingEnd: string } | null;\n" +
      "  /** Effective teaching dates: derived from Academic Calendar for linked offerings, legacy snapshots otherwise. */\n" +
      "  startDate: string | null;\n  endDate: string | null;\n",
  );
}

// Academic Calendar service: programme context, current-year read, and audit trail for admin/reuse consumers.
{
  const path = "apps/backend/src/plugins/programme/academic-calendar-service.ts";
  replaceOnce(
    path,
    "  AcademicCalendarView, AcademicYearView, CreateAcademicCalendarInput, CreateAcademicYearInput,\n",
    "  AcademicCalendarView, AcademicYearView, AcademicCalendarAuditView, AcademicCalendarProgrammeRef, CreateAcademicCalendarInput, CreateAcademicYearInput,\n",
  );
  replaceOnce(
    path,
    "export const academicCalendarService = {\n  async listAcademicYears(programmeId: string): Promise<AcademicYearView[]> {",
    `export const academicCalendarService = {
  async programmeContext(): Promise<AcademicCalendarProgrammeRef> {
    const programme = await prisma.programme.findFirst({
      where: { status: "active" },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, name: true },
    });
    if (!programme) throw new AcademicCalendarNotFoundError("No active programme is configured");
    return programme;
  },
  async currentAcademicYear(programmeId: string): Promise<AcademicYearView | null> {
    const row = await prisma.academicYear.findFirst({ where: { programmeId, isCurrent: true } });
    return row ? yearView(row) : null;
  },
  async auditHistory(programmeId: string, calendarId: string): Promise<AcademicCalendarAuditView[]> {
    await requireCalendar(programmeId, calendarId);
    const rows = await prisma.academicCalendarAuditAction.findMany({
      where: { calendarId },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      calendarId: row.calendarId,
      actorId: row.actorId,
      actorName: row.actor.name,
      action: row.action,
      reason: row.reason,
      beforeSnapshot: row.beforeSnapshot,
      afterSnapshot: row.afterSnapshot,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    }));
  },
  async listAcademicYears(programmeId: string): Promise<AcademicYearView[]> {`,
  );
}

// Academic Calendar router: resolve the single active DSE programme safely and expose append-only audit history.
{
  const path = "apps/backend/src/plugins/programme/academic-calendar-router.ts";
  replaceOnce(
    path,
    "  const router = Router(); router.use(requireAuth);\n",
    `  const router = Router(); router.use(requireAuth);
  router.get("/academic-calendar/programme", requirePermission("programme:read"), async (req, res) => {
    try {
      const programme = await academicCalendarService.programmeContext();
      if (!canReadAcademicCalendar(req.user, programme.id)) return void res.status(403).json({ error: "No academic calendar access for this programme" });
      res.json(programme);
    } catch (error) { sendError(res, error); }
  });
`,
  );
  replaceOnce(
    path,
    "  router.post(\"/programmes/:programmeId/academic-calendar/calendars/:calendarId/archive\", requirePermission(\"programme:write\"),",
    `  router.get("/programmes/:programmeId/academic-calendar/calendars/:calendarId/audit", requirePermission("programme:read"), async (req, res) => {
    const id = programmeId(req, res); if (!id) return;
    if (!canReadAcademicCalendar(req.user, id)) return void res.status(403).json({ error: "No academic calendar access for this programme" });
    try { res.json(await academicCalendarService.auditHistory(id, req.params.calendarId!)); } catch (error) { sendError(res, error); }
  });
  router.post("/programmes/:programmeId/academic-calendar/calendars/:calendarId/archive", requirePermission("programme:write"),`,
  );
}

// Offerings consume the Programme plugin's Academic Calendar service contract through the registry.
{
  const path = "apps/backend/src/plugins/offerings/service.ts";
  replaceOnce(
    path,
    "  coLecturerViolation,\n  teachingPeriodViolation,\n",
    "  coLecturerViolation,\n  teachingPeriodViolation,\n  type AcademicCalendarServiceContract,\n",
  );
  replaceOnce(
    path,
    "const students = () => registry.get<StudentsServiceContract>(\"students\").service;\n",
    "const students = () => registry.get<StudentsServiceContract>(\"students\").service;\n" +
      "const academicCalendars = () => registry.get<{ academicCalendar: AcademicCalendarServiceContract }>(\"programme\").service.academicCalendar;\n",
  );
  replaceOnce(
    path,
    "  meetings: true,\n} as const;",
    `  meetings: true,
  academicCalendarPeriod: {
    include: {
      calendar: { include: { academicYear: true, studyYears: true } },
    },
  },
} as const;`,
  );
  replaceOnce(
    path,
    "    endDate: Date | null;\n    otherLecturers: string | null;\n",
    `    endDate: Date | null;
    academicCalendarPeriodId: string | null;
    academicCalendarPeriod: {
      id: string;
      calendarId: string;
      semester: OfferingView["semester"] extends infer _T ? "First" | "Second" : never;
      teachingStart: Date;
      teachingEnd: Date;
      calendar: {
        revision: number;
        academicYearId: string;
        academicYear: { id: string; label: string };
        studyYears: { studyYear: number }[];
      };
    } | null;
    otherLecturers: string | null;
`,
  );
  replaceOnce(
    path,
    "    programmeYear: offering.programmeYear,\n    startDate: dateOnly(offering.startDate),\n    endDate: dateOnly(offering.endDate),\n",
    `    programmeYear: offering.programmeYear,
    academicCalendarPeriodId: offering.academicCalendarPeriodId,
    academicCalendar: offering.academicCalendarPeriod
      ? {
          periodId: offering.academicCalendarPeriod.id,
          calendarId: offering.academicCalendarPeriod.calendarId,
          academicYearId: offering.academicCalendarPeriod.calendar.academicYearId,
          academicYearLabel: offering.academicCalendarPeriod.calendar.academicYear.label,
          revision: offering.academicCalendarPeriod.calendar.revision,
          studyYears: offering.academicCalendarPeriod.calendar.studyYears.map((item) => item.studyYear).sort((a, b) => a - b),
          semester: offering.academicCalendarPeriod.semester,
          teachingStart: dateOnly(offering.academicCalendarPeriod.teachingStart)!,
          teachingEnd: dateOnly(offering.academicCalendarPeriod.teachingEnd)!,
        }
      : null,
    startDate: dateOnly(offering.academicCalendarPeriod?.teachingStart ?? offering.startDate),
    endDate: dateOnly(offering.academicCalendarPeriod?.teachingEnd ?? offering.endDate),
`,
  );
  replaceRange(
    path,
    "  async create(input: CreateOfferingInput): Promise<OfferingView> {",
    "  async update(id: string, input: UpdateOfferingInput): Promise<OfferingView> {",
    `  async create(input: CreateOfferingInput): Promise<OfferingView> {
    const { coLecturerIds, meetings, ...offeringInput } = input;
    const course = await courses().getById(offeringInput.courseId);
    if (!course) throw new ReferenceError("Course does not exist");
    await assertApprovedCourseSpec(offeringInput.courseId, offeringInput.courseSpecId);
    if (offeringInput.lecturerId && !(await lecturers().getById(offeringInput.lecturerId))) {
      throw new ReferenceError("Assigned lecturer does not exist");
    }
    if (coLecturerIds?.length) await assertLecturersExist(coLecturerIds);
    if (!offeringInput.academicCalendarPeriodId || !offeringInput.programmeYear || !offeringInput.semester) {
      throw new ReferenceError("A published Academic Calendar period, study year, and semester are required");
    }
    const period = await academicCalendars().getPublishedPeriodForOffering(
      offeringInput.academicCalendarPeriodId,
      course.programmeId,
      offeringInput.programmeYear,
    );
    if (!period) throw new ReferenceError("The selected Academic Calendar period is not published for this programme and study year");
    if (period.semester !== offeringInput.semester) throw new ReferenceError("The selected semester does not match the published Academic Calendar period");
    try {
      await academicCalendars().assertCoursePlacement(
        course.programmeId,
        period.academicYearId,
        offeringInput.programmeYear,
        period.semester,
        offeringInput.courseId,
      );
    } catch (error) {
      throw new ReferenceError(error instanceof Error ? error.message : "The selected course is not in the applicable curriculum");
    }

    const offering = await prisma.offering.create({
      data: {
        courseId: offeringInput.courseId,
        courseSpecId: offeringInput.courseSpecId,
        term: offeringInput.term,
        sectionCode: offeringInput.sectionCode,
        lecturerId: offeringInput.lecturerId ?? null,
        capacity: offeringInput.capacity,
        status: offeringInput.status,
        semester: period.semester,
        programmeYear: offeringInput.programmeYear,
        academicCalendarPeriodId: period.id,
        startDate: null,
        endDate: null,
        otherLecturers: offeringInput.otherLecturers ?? null,
        coLecturers: coLecturerIds?.length
          ? { create: coLecturerIds.map((lecturerId) => ({ lecturerId })) }
          : undefined,
        meetings: meetings.length
          ? { create: meetings.map((meeting) => ({ ...meeting, room: meeting.room || null })) }
          : undefined,
      },
      include: withRelations,
    });
    return toView(offering, await lecturerLookup());
  },

`,
  );
  replaceRange(
    path,
    "  async update(id: string, input: UpdateOfferingInput): Promise<OfferingView> {",
    "  async remove(id: string) {",
    `  async update(id: string, input: UpdateOfferingInput): Promise<OfferingView> {
    const { coLecturerIds, meetings, ...offeringInput } = input;
    if (offeringInput.lecturerId && !(await lecturers().getById(offeringInput.lecturerId))) {
      throw new ReferenceError("Assigned lecturer does not exist");
    }

    const existing = await prisma.offering.findUnique({
      where: { id },
      include: { coLecturers: { select: { lecturerId: true } } },
    });
    if (!existing) throw new ReferenceError("Offering not found");
    if (!existing.courseSpecId && offeringInput.courseSpecId === undefined) {
      throw new ReferenceError("Offering must be bound to an Approved CourseSpec version before it can be updated");
    }
    if (offeringInput.courseSpecId !== undefined) {
      await assertApprovedCourseSpec(existing.courseId, offeringInput.courseSpecId);
      if (existing.courseSpecId && offeringInput.courseSpecId !== existing.courseSpecId) {
        const [deadlineCount, resultCount] = await Promise.all([
          prisma.offeringAssessmentDeadline.count({ where: { offeringId: id } }),
          prisma.assessmentResult.count({ where: { enrollment: { offeringId: id } } }),
        ]);
        if (existing.status !== "Planned" || deadlineCount > 0 || resultCount > 0) {
          throw new ReferenceError("The bound CourseSpec version cannot change after delivery or academic data exists");
        }
      }
    }

    const nextLecturerId = offeringInput.lecturerId !== undefined ? offeringInput.lecturerId : existing.lecturerId;
    const nextCoLecturerIds = coLecturerIds !== undefined ? coLecturerIds : existing.coLecturers.map((item) => item.lecturerId);
    if (coLecturerViolation({ lecturerId: nextLecturerId, coLecturerIds: nextCoLecturerIds })) {
      throw new ReferenceError("The primary lecturer cannot also be a co-lecturer");
    }
    if (coLecturerIds?.length) await assertLecturersExist(coLecturerIds);

    const calendarContextChanging =
      offeringInput.academicCalendarPeriodId !== undefined ||
      offeringInput.programmeYear !== undefined ||
      offeringInput.semester !== undefined;
    if (existing.status === "Completed" && calendarContextChanging) {
      throw new ReferenceError("Completed offering academic-calendar context is historical and cannot be changed");
    }
    if (existing.academicCalendarPeriodId && (offeringInput.startDate !== undefined || offeringInput.endDate !== undefined)) {
      throw new ReferenceError("Teaching dates for calendar-linked offerings come from the Academic Calendar");
    }

    const requestedPeriodId =
      offeringInput.academicCalendarPeriodId !== undefined
        ? offeringInput.academicCalendarPeriodId
        : existing.academicCalendarPeriodId;
    const nextProgrammeYear =
      offeringInput.programmeYear !== undefined ? offeringInput.programmeYear : existing.programmeYear;
    let resolvedPeriod: Awaited<ReturnType<AcademicCalendarServiceContract["getPublishedPeriodForOffering"]>> = null;

    if (requestedPeriodId && existing.status !== "Completed") {
      if (!nextProgrammeYear || nextProgrammeYear < 1 || nextProgrammeYear > 4) {
        throw new ReferenceError("A study year between 1 and 4 is required for the Academic Calendar period");
      }
      const course = await courses().getById(existing.courseId);
      if (!course) throw new ReferenceError("Course does not exist");
      resolvedPeriod = await academicCalendars().getPublishedPeriodForOffering(requestedPeriodId, course.programmeId, nextProgrammeYear);
      if (!resolvedPeriod) throw new ReferenceError("The selected Academic Calendar period is not currently published for this programme and study year");
      if (offeringInput.semester !== undefined && offeringInput.semester !== resolvedPeriod.semester) {
        throw new ReferenceError("The selected semester does not match the Academic Calendar period");
      }
      try {
        await academicCalendars().assertCoursePlacement(
          course.programmeId,
          resolvedPeriod.academicYearId,
          nextProgrammeYear,
          resolvedPeriod.semester,
          existing.courseId,
        );
      } catch (error) {
        throw new ReferenceError(error instanceof Error ? error.message : "The course is not in the applicable curriculum");
      }
    } else if (!requestedPeriodId) {
      const nextStartDate = offeringInput.startDate !== undefined ? offeringInput.startDate : dateOnly(existing.startDate);
      const nextEndDate = offeringInput.endDate !== undefined ? offeringInput.endDate : dateOnly(existing.endDate);
      const violation = teachingPeriodViolation({ startDate: nextStartDate, endDate: nextEndDate });
      if (violation === "missingStart" || violation === "missingEnd") throw new ReferenceError("Teaching start and end dates must be set together");
      if (violation === "endBeforeStart") throw new ReferenceError("Teaching end date must be on or after start date");
    }

    const offering = await prisma.$transaction(async (tx) => {
      if (coLecturerIds !== undefined) {
        await tx.offeringCoLecturer.deleteMany({ where: { offeringId: id } });
        if (coLecturerIds.length) await tx.offeringCoLecturer.createMany({ data: coLecturerIds.map((lecturerId) => ({ offeringId: id, lecturerId })) });
      }
      if (meetings !== undefined) {
        await tx.offeringMeeting.deleteMany({ where: { offeringId: id } });
        if (meetings.length) await tx.offeringMeeting.createMany({ data: meetings.map((meeting) => ({ offeringId: id, ...meeting, room: meeting.room || null })) });
      }
      return tx.offering.update({
        where: { id },
        data: {
          ...(offeringInput.courseSpecId !== undefined ? { courseSpecId: offeringInput.courseSpecId } : {}),
          ...(offeringInput.term !== undefined ? { term: offeringInput.term } : {}),
          ...(offeringInput.sectionCode !== undefined ? { sectionCode: offeringInput.sectionCode } : {}),
          ...(offeringInput.lecturerId !== undefined ? { lecturerId: offeringInput.lecturerId } : {}),
          ...(offeringInput.capacity !== undefined ? { capacity: offeringInput.capacity } : {}),
          ...(offeringInput.status !== undefined ? { status: offeringInput.status } : {}),
          ...(resolvedPeriod ? { academicCalendarPeriodId: resolvedPeriod.id, semester: resolvedPeriod.semester, programmeYear: nextProgrammeYear, startDate: null, endDate: null } : {}),
          ...(!requestedPeriodId && offeringInput.semester !== undefined ? { semester: offeringInput.semester } : {}),
          ...(!requestedPeriodId && offeringInput.programmeYear !== undefined ? { programmeYear: offeringInput.programmeYear } : {}),
          ...(!requestedPeriodId && offeringInput.startDate !== undefined ? { startDate: toDate(offeringInput.startDate) } : {}),
          ...(!requestedPeriodId && offeringInput.endDate !== undefined ? { endDate: toDate(offeringInput.endDate) } : {}),
          ...(offeringInput.otherLecturers !== undefined ? { otherLecturers: offeringInput.otherLecturers } : {}),
        },
        include: withRelations,
      });
    });
    return toView(offering, await lecturerLookup());
  },

`,
  );
}

// Student Portal resolves calendar context from authoritative cohort membership + progression records, then delegates calendar reads to Programme plugin.
{
  const path = "apps/backend/src/plugins/student-portal/service.ts";
  replaceOnce(
    path,
    "  StudentPortalHome,\n} from \"@dse-pms/shared-types\";",
    "  StudentPortalHome,\n  type AcademicYearView,\n  type PublishedAcademicCalendarProjection,\n  type StudentAcademicCalendarView,\n} from \"@dse-pms/shared-types\";",
  );
  replaceOnce(
    path,
    "import { prisma } from \"../../core/db/prisma.ts\";\n",
    "import { prisma } from \"../../core/db/prisma.ts\";\nimport { registry } from \"../../core/plugins/registry.ts\";\n",
  );
  replaceOnce(
    path,
    "async function enrolledRows(userId: string) {",
    `interface ProgrammeCalendarReadContract {
  academicCalendar: {
    currentAcademicYear(programmeId: string): Promise<AcademicYearView | null>;
    publishedProjection(programmeId: string, studyYear: number, academicYearLabel?: string): Promise<PublishedAcademicCalendarProjection>;
  };
}

async function academicCalendarForStudent(userId: string): Promise<StudentAcademicCalendarView> {
  const student = await studentForUser(userId);
  const membership = await prisma.studentCohortMembership.findFirst({
    where: { studentId: student.id, exitedAt: null },
    include: {
      cohort: { select: { programmeId: true } },
      progressionRecords: { orderBy: [{ periodStart: "desc" }, { recordedAt: "desc" }] },
    },
    orderBy: { joinedAt: "desc" },
  });
  if (!membership) {
    return { status: "unavailable", academicYear: null, studyYear: null, reason: "student-context-unavailable", message: "Your current programme cohort has not been configured yet." };
  }
  const programme = registry.get<ProgrammeCalendarReadContract>("programme").service;
  const academicYear = await programme.academicCalendar.currentAcademicYear(membership.cohort.programmeId);
  if (!academicYear) {
    return { status: "unavailable", academicYear: null, studyYear: null, reason: "academic-year-unavailable", message: "No current academic year is configured for your programme." };
  }
  const progression = membership.progressionRecords.find((record) =>
    record.academicYear === academicYear.label && record.programmeYear !== null && record.programmeYear >= 1 && record.programmeYear <= 4,
  );
  if (!progression?.programmeYear) {
    return { status: "unavailable", academicYear, studyYear: null, reason: "student-context-unavailable", message: "Your current study year has not been recorded yet. Please contact the programme office." };
  }
  const projection = await programme.academicCalendar.publishedProjection(
    membership.cohort.programmeId,
    progression.programmeYear,
    academicYear.label,
  );
  if (projection.status === "unavailable") {
    return { status: "unavailable", academicYear: projection.academicYear, studyYear: progression.programmeYear, reason: projection.reason, message: projection.message };
  }
  return {
    status: "available",
    academicYear: projection.academicYear,
    studyYear: progression.programmeYear,
    periods: projection.periods,
    events: projection.events,
    nextEvent: projection.nextEvent,
  };
}

async function enrolledRows(userId: string) {`,
  );
  replaceOnce(
    path,
    "  async courses(userId: string): Promise<PortalCourseSummary[]> {",
    `  async academicCalendar(userId: string): Promise<StudentAcademicCalendarView> {
    return academicCalendarForStudent(userId);
  },

  async courses(userId: string): Promise<PortalCourseSummary[]> {`,
  );
  replaceOnce(
    path,
    "    const measured = details.flatMap((course) => course.overallAchievement === null ? [] : [course.overallAchievement]);\n    return {",
    "    const measured = details.flatMap((course) => course.overallAchievement === null ? [] : [course.overallAchievement]);\n    const academicCalendar = await academicCalendarForStudent(userId);\n    return {",
  );
  replaceOnce(
    path,
    "      announcements: announcementsFrom(rows).slice(0, 5),\n      overallAchievement:",
    "      announcements: announcementsFrom(rows).slice(0, 5),\n      academicCalendar,\n      overallAchievement:",
  );
}

// Student-only published calendar endpoint.
{
  const path = "apps/backend/src/plugins/student-portal/router.ts";
  replaceOnce(
    path,
    "  router.get(\"/courses\", requirePermission(\"student-portal:read\"), async (req, res) => {",
    `  router.get("/academic-calendar", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortalService.academicCalendar(req.user!.id)); } catch (error) { handleError(error, res); }
  });
  router.get("/courses", requirePermission("student-portal:read"), async (req, res) => {`,
  );
}

console.log("Epic #638 backend/contracts consumer integration applied");
