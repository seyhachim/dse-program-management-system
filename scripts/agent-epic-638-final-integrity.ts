import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path: string, before: string, after: string): void {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing expected snippet in ${path}: ${before.slice(0, 160)}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Expected one occurrence in ${path}: ${before.slice(0, 160)}`);
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length));
}

const offeringService = "apps/backend/src/plugins/offerings/service.ts";
replaceOnce(
  offeringService,
  `    const calendarContextChanging =\n      offeringInput.academicCalendarPeriodId !== undefined ||\n      offeringInput.programmeYear !== undefined ||\n      offeringInput.semester !== undefined ||\n      (existing.academicCalendarPeriodId !== null && offeringInput.term !== undefined);\n`,
  `    const calendarContextChanging =\n      offeringInput.academicCalendarPeriodId !== undefined ||\n      offeringInput.programmeYear !== undefined ||\n      offeringInput.semester !== undefined;\n`,
);
replaceOnce(
  offeringService,
  `          ...(resolvedPeriod\n            ? { term: \`${'${'}resolvedPeriod.academicYearLabel}-${'${'}resolvedPeriod.semester === "First" ? "S1" : "S2"}\` }\n            : offeringInput.term !== undefined ? { term: offeringInput.term } : {}),\n`,
  `          ...(resolvedPeriod\n            ? { term: \`${'${'}resolvedPeriod.academicYearLabel}-${'${'}resolvedPeriod.semester === "First" ? "S1" : "S2"}\` }\n            : existing.academicCalendarPeriodId === null && offeringInput.term !== undefined\n              ? { term: offeringInput.term }\n              : {}),\n`,
);

const offeringForm = "apps/frontend/app/(shell)/offerings/offering-form-page.tsx";
replaceOnce(
  offeringForm,
  `        if (!contextChanged) {\n          delete payload.academicCalendarPeriodId;\n          delete payload.programmeYear;\n          delete payload.semester;\n        }\n        if (legacyOffering) {\n`,
  `        if (!contextChanged) {\n          delete payload.academicCalendarPeriodId;\n          delete payload.programmeYear;\n          delete payload.semester;\n        }\n        if (loadedOffering?.academicCalendarPeriodId) {\n          // Term is server-owned once an Offering is linked to an Academic Calendar.\n          delete payload.term;\n        }\n        if (legacyOffering) {\n`,
);

const calendarClient = "apps/frontend/app/(shell)/academic-calendar/academic-calendar-client.tsx";
replaceOnce(
  calendarClient,
  `  useEffect(() => {\n    if (!selectedCalendar) { setSelectedCalendarId(""); setAuditRows([]); return; }\n    setSelectedCalendarId(selectedCalendar.id);\n    if (!editing && !creating) setDraft(fromCalendar(selectedCalendar));\n    void academicCalendarApi.audit(programmeId, selectedCalendar.id)\n      .then((rows) => setAuditRows(rows))\n      .catch(() => setAuditRows([]));\n  }, [selectedCalendar?.id, programmeId, editing, creating]);\n`,
  `  useEffect(() => {\n    if (!selectedCalendar) { setSelectedCalendarId(""); setAuditRows([]); return; }\n    let cancelled = false;\n    setSelectedCalendarId(selectedCalendar.id);\n    if (!editing && !creating) setDraft(fromCalendar(selectedCalendar));\n    void academicCalendarApi.audit(programmeId, selectedCalendar.id)\n      .then((rows) => { if (!cancelled) setAuditRows(rows); })\n      .catch(() => { if (!cancelled) setAuditRows([]); });\n    return () => { cancelled = true; };\n  }, [selectedCalendar, programmeId, editing, creating]);\n`,
);

const calendarService = "apps/backend/src/plugins/programme/academic-calendar-service.ts";
replaceOnce(
  calendarService,
  `  async programmeContext(): Promise<AcademicCalendarProgrammeRef> {\n    const programme = await prisma.programme.findFirst({\n      where: { status: "active" },\n      orderBy: { createdAt: "asc" },\n      select: { id: true, code: true, name: true },\n    });\n    if (!programme) throw new AcademicCalendarNotFoundError("No active programme is configured");\n    return programme;\n  },\n`,
  `  async programmeContext(programmeIds: string[] | null = null): Promise<AcademicCalendarProgrammeRef> {\n    const programme = await prisma.programme.findFirst({\n      where: { status: "active", ...(programmeIds === null ? {} : { id: { in: programmeIds } }) },\n      orderBy: { createdAt: "asc" },\n      select: { id: true, code: true, name: true },\n    });\n    if (!programme) throw new AcademicCalendarNotFoundError("No accessible active programme is configured");\n    return programme;\n  },\n`,
);

const calendarRouter = "apps/backend/src/plugins/programme/academic-calendar-router.ts";
replaceOnce(
  calendarRouter,
  `export function canReadAcademicCalendar(user: AuthUser | undefined, programmeId: string) { return Boolean(user && hasAnyRoleInProgramme(user, READ_ROLES, programmeId)); }\nexport function canWriteAcademicCalendar(user: AuthUser | undefined, programmeId: string) { return Boolean(user && hasAnyRoleInProgramme(user, WRITE_ROLES, programmeId)); }\n`,
  `export function canReadAcademicCalendar(user: AuthUser | undefined, programmeId: string) { return Boolean(user && hasAnyRoleInProgramme(user, READ_ROLES, programmeId)); }\nexport function canWriteAcademicCalendar(user: AuthUser | undefined, programmeId: string) { return Boolean(user && hasAnyRoleInProgramme(user, WRITE_ROLES, programmeId)); }\n/** null means a global readable grant; otherwise only these programme ids may be selected. */\nexport function academicCalendarProgrammeScope(user: AuthUser | undefined): string[] | null {\n  if (!user) return [];\n  const readable = user.programmeRoles.filter((assignment) => READ_ROLES.includes(assignment.role));\n  if (readable.some((assignment) => assignment.programmeId === null)) return null;\n  return [...new Set(readable.flatMap((assignment) => assignment.programmeId ? [assignment.programmeId] : []))];\n}\n`,
);
replaceOnce(
  calendarRouter,
  `  router.get("/academic-calendar/programme", requirePermission("programme:read"), async (req, res) => {\n    try {\n      const programme = await academicCalendarService.programmeContext();\n      if (!canReadAcademicCalendar(req.user, programme.id)) return void res.status(403).json({ error: "No academic calendar access for this programme" });\n      res.json(programme);\n    } catch (error) { sendError(res, error); }\n  });\n`,
  `  router.get("/academic-calendar/programme", requirePermission("programme:read"), async (req, res) => {\n    if (!req.user) return;\n    const scope = academicCalendarProgrammeScope(req.user);\n    if (scope !== null && scope.length === 0) return void res.status(403).json({ error: "No academic calendar access for an active programme" });\n    try {\n      const programme = await academicCalendarService.programmeContext(scope);\n      res.json(programme);\n    } catch (error) { sendError(res, error); }\n  });\n`,
);

const routerTest = "apps/backend/src/plugins/programme/academic-calendar-router.test.ts";
replaceOnce(
  routerTest,
  `import { canReadAcademicCalendar, canWriteAcademicCalendar } from "./academic-calendar-router.ts";\n`,
  `import { academicCalendarProgrammeScope, canReadAcademicCalendar, canWriteAcademicCalendar } from "./academic-calendar-router.ts";\n`,
);
replaceOnce(
  routerTest,
  `  test("fails closed across programmes and for student/lecturer roles", () => {\n    expect(canReadAcademicCalendar(user([{ role: "program_coordinator", programmeId: "other" }]), "dse")).toBe(false);\n    expect(canWriteAcademicCalendar(user([{ role: "program_coordinator", programmeId: "other" }]), "dse")).toBe(false);\n    expect(canReadAcademicCalendar(user([{ role: "student", programmeId: "dse" }]), "dse")).toBe(false);\n    expect(canReadAcademicCalendar(user([{ role: "lecturer", programmeId: "dse" }]), "dse")).toBe(false);\n  });\n`,
  `  test("fails closed across programmes and for student/lecturer roles", () => {\n    expect(canReadAcademicCalendar(user([{ role: "program_coordinator", programmeId: "other" }]), "dse")).toBe(false);\n    expect(canWriteAcademicCalendar(user([{ role: "program_coordinator", programmeId: "other" }]), "dse")).toBe(false);\n    expect(canReadAcademicCalendar(user([{ role: "student", programmeId: "dse" }]), "dse")).toBe(false);\n    expect(canReadAcademicCalendar(user([{ role: "lecturer", programmeId: "dse" }]), "dse")).toBe(false);\n  });\n  test("programme context selection is limited to the caller's readable grants", () => {\n    expect(academicCalendarProgrammeScope(user([{ role: "admin", programmeId: null }]))).toBeNull();\n    expect(academicCalendarProgrammeScope(user([\n      { role: "program_coordinator", programmeId: "programme-b" },\n      { role: "program_secretary", programmeId: "programme-b" },\n      { role: "lecturer", programmeId: "programme-a" },\n    ]))).toEqual(["programme-b"]);\n    expect(academicCalendarProgrammeScope(user([{ role: "lecturer", programmeId: "programme-a" }]))).toEqual([]);\n  });\n`,
);

const migration = "apps/backend/prisma/migrations/20260825162500_academic_calendar_epic_638/migration.sql";
replaceOnce(
  migration,
  `CREATE OR REPLACE FUNCTION guard_offering_academic_calendar_integrity() RETURNS trigger AS $$\nBEGIN\n  IF NEW."academicCalendarPeriodId" IS NOT NULL AND (NEW."startDate" IS NOT NULL OR NEW."endDate" IS NOT NULL) THEN\n    RAISE EXCEPTION 'Calendar-linked offerings cannot store independent teaching dates';\n  END IF;\n\n  IF TG_OP = 'UPDATE' AND OLD."status" = 'Completed' AND (\n    NEW."academicCalendarPeriodId" IS DISTINCT FROM OLD."academicCalendarPeriodId" OR\n    NEW."semester" IS DISTINCT FROM OLD."semester" OR\n    NEW."programmeYear" IS DISTINCT FROM OLD."programmeYear" OR\n    NEW."term" IS DISTINCT FROM OLD."term"\n  ) THEN\n    RAISE EXCEPTION 'Completed offering academic-calendar context is historical and cannot be changed';\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n`,
  `CREATE OR REPLACE FUNCTION guard_offering_academic_calendar_integrity() RETURNS trigger AS $$\nDECLARE\n  target_status "AcademicCalendarStatus";\n  target_semester "Semester";\n  target_year_label TEXT;\n  target_programme_id TEXT;\n  course_programme_id TEXT;\n  target_study_year_ok BOOLEAN;\n  expected_term TEXT;\n  period_changed BOOLEAN;\nBEGIN\n  IF NEW."academicCalendarPeriodId" IS NULL THEN\n    RETURN NEW;\n  END IF;\n\n  IF NEW."startDate" IS NOT NULL OR NEW."endDate" IS NOT NULL THEN\n    RAISE EXCEPTION 'Calendar-linked offerings cannot store independent teaching dates';\n  END IF;\n\n  SELECT ac."status", p."semester", ay."label", ay."programmeId", c."programmeId",\n         EXISTS (SELECT 1 FROM "AcademicCalendarStudyYear" sy WHERE sy."calendarId" = ac."id" AND sy."studyYear" = NEW."programmeYear")\n  INTO target_status, target_semester, target_year_label, target_programme_id, course_programme_id, target_study_year_ok\n  FROM "AcademicCalendarPeriod" p\n  JOIN "AcademicCalendar" ac ON ac."id" = p."calendarId"\n  JOIN "AcademicYear" ay ON ay."id" = ac."academicYearId"\n  JOIN "Course" c ON c."id" = NEW."courseId"\n  WHERE p."id" = NEW."academicCalendarPeriodId";\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Academic Calendar period or Offering course does not exist';\n  END IF;\n\n  IF TG_OP = 'INSERT' THEN\n    period_changed := TRUE;\n  ELSE\n    period_changed := NEW."academicCalendarPeriodId" IS DISTINCT FROM OLD."academicCalendarPeriodId";\n  END IF;\n\n  IF period_changed AND target_status <> 'Published' THEN\n    RAISE EXCEPTION 'New or rebound Offering links require a Published Academic Calendar period';\n  END IF;\n  IF target_programme_id IS DISTINCT FROM course_programme_id THEN\n    RAISE EXCEPTION 'Offering course and Academic Calendar must belong to the same programme';\n  END IF;\n  IF NEW."programmeYear" IS NULL OR NOT target_study_year_ok THEN\n    RAISE EXCEPTION 'Offering study year is not covered by the Academic Calendar';\n  END IF;\n  IF NEW."semester" IS DISTINCT FROM target_semester THEN\n    RAISE EXCEPTION 'Offering semester must match the Academic Calendar period';\n  END IF;\n\n  expected_term := target_year_label || CASE WHEN target_semester = 'First' THEN '-S1' ELSE '-S2' END;\n  IF NEW."term" IS DISTINCT FROM expected_term THEN\n    RAISE EXCEPTION 'Offering term must be derived from the Academic Calendar';\n  END IF;\n\n  IF TG_OP = 'UPDATE' AND OLD."status" = 'Completed' AND (\n    NEW."academicCalendarPeriodId" IS DISTINCT FROM OLD."academicCalendarPeriodId" OR\n    NEW."semester" IS DISTINCT FROM OLD."semester" OR\n    NEW."programmeYear" IS DISTINCT FROM OLD."programmeYear" OR\n    NEW."term" IS DISTINCT FROM OLD."term"\n  ) THEN\n    RAISE EXCEPTION 'Completed offering academic-calendar context is historical and cannot be changed';\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n`,
);

const integrityTest = "apps/backend/src/plugins/programme/academic-calendar-integrity-db.test.ts";
replaceOnce(
  integrityTest,
  `    const original = await academicCalendarService.publishCalendar(course.programmeId, originalDraft.id, actor.id);\n    const originalPeriod = original.periods[0]!;\n\n`,
  `    const original = await academicCalendarService.publishCalendar(course.programmeId, originalDraft.id, actor.id);\n    const originalPeriod = original.periods[0]!;\n    const canonicalTerm = \`${'${'}academicYear.label}-S1\`;\n\n`,
);
replaceOnce(
  integrityTest,
  `        term: \`cal-active-${'${'}suffix}\`,\n`,
  `        term: canonicalTerm,\n`,
);
replaceOnce(
  integrityTest,
  `        term: \`cal-completed-${'${'}suffix}\`,\n`,
  `        term: canonicalTerm,\n`,
);
replaceOnce(
  integrityTest,
  `    const completed = await prisma.offering.create({\n      data: {\n        courseId: course.id,\n        term: canonicalTerm,\n        sectionCode: "A",\n        capacity: 30,\n        status: "Completed",\n        semester: "First",\n        programmeYear: 3,\n        academicCalendarPeriodId: originalPeriod.id,\n      },\n    });\n\n`,
  `    const completed = await prisma.offering.create({\n      data: {\n        courseId: course.id,\n        term: canonicalTerm,\n        sectionCode: "A",\n        capacity: 30,\n        status: "Completed",\n        semester: "First",\n        programmeYear: 3,\n        academicCalendarPeriodId: originalPeriod.id,\n      },\n    });\n\n    let termTamperRejected = false;\n    try {\n      await prisma.offering.update({ where: { id: active.id }, data: { term: "tampered-term" } });\n    } catch {\n      termTamperRejected = true;\n    }\n    expect(termTamperRejected).toBe(true);\n\n    let draftPeriodLinkRejected = false;\n    try {\n      await prisma.offering.update({\n        where: { id: active.id },\n        data: {\n          academicCalendarPeriodId: moveTarget.periods[0]!.id,\n          semester: "Second",\n          programmeYear: 3,\n          term: \`${'${'}academicYear.label}-S2\`,\n        },\n      });\n    } catch {\n      draftPeriodLinkRejected = true;\n    }\n    expect(draftPeriodLinkRejected).toBe(true);\n\n    const foreignProgrammeId = \`calendar-foreign-${'${'}suffix}\`;\n    await prisma.programme.create({ data: { id: foreignProgrammeId, code: \`FC-${'${'}suffix.slice(0, 8)}\`, name: "Foreign Calendar Programme", status: "active" } });\n    const foreignYear = await academicCalendarService.createAcademicYear(foreignProgrammeId, {\n      label: \`2198-2199-foreign-${'${'}suffix.slice(0, 8)}\`,\n      startYear: 2198,\n      endYear: 2199,\n      isCurrent: false,\n    });\n    const foreignDraft = await academicCalendarService.createCalendar(foreignProgrammeId, actor.id, {\n      academicYearId: foreignYear.id,\n      revisionReason: "Foreign programme calendar",\n      studyYears: [3],\n      periods: [{ semester: "First", teachingStart: "2198-09-01", teachingEnd: "2199-01-15" }],\n      events: [],\n      sourceTitle: "Foreign official calendar",\n      sourcePublishedAt: "2198-08-01",\n      sourceUrl: null,\n      sourceFileRef: null,\n      sourceNote: "Foreign official source",\n    });\n    const foreignPublished = await academicCalendarService.publishCalendar(foreignProgrammeId, foreignDraft.id, actor.id);\n    let crossProgrammeLinkRejected = false;\n    try {\n      await prisma.offering.update({\n        where: { id: active.id },\n        data: { academicCalendarPeriodId: foreignPublished.periods[0]!.id, term: \`${'${'}foreignYear.label}-S1\` },\n      });\n    } catch {\n      crossProgrammeLinkRejected = true;\n    }\n    expect(crossProgrammeLinkRejected).toBe(true);\n\n`,
);
replaceOnce(
  integrityTest,
  `    expect(completedAfter.academicCalendarPeriodId).toBe(originalPeriod.id);\n    expect(oldCalendar.status).toBe("Superseded");\n`,
  `    expect(completedAfter.academicCalendarPeriodId).toBe(originalPeriod.id);\n    const completedCapacityUpdate = await prisma.offering.update({ where: { id: completed.id }, data: { capacity: 31 } });\n    expect(completedCapacityUpdate.capacity).toBe(31);\n    expect(oldCalendar.status).toBe("Superseded");\n`,
);

console.log("Epic #638 final integrity fixes applied.");
