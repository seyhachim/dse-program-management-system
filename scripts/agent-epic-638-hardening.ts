import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path: string, before: string, after: string): void {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing expected snippet in ${path}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Expected one occurrence in ${path}: ${before.slice(0, 120)}`);
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length));
}

function insertAfter(path: string, anchor: string, addition: string): void {
  replaceOnce(path, anchor, anchor + addition);
}

const offeringsTest = "packages/shared-types/src/offerings.test.ts";
replaceOnce(
  offeringsTest,
  'const COURSE_SPEC = "44444444-4444-4444-4444-444444444444";\n',
  'const COURSE_SPEC = "44444444-4444-4444-4444-444444444444";\nconst CALENDAR_PERIOD = "55555555-5555-5555-5555-555555555555";\n',
);
replaceOnce(
  offeringsTest,
  '    term: "2026-Fall",\n    lecturerId: A,\n    meetings: [VALID_MEETING],\n    startDate: "2026-08-10",\n    endDate: "2026-11-28",\n',
  '    term: "2026-2027-S1",\n    lecturerId: A,\n    meetings: [VALID_MEETING],\n    academicCalendarPeriodId: CALENDAR_PERIOD,\n    programmeYear: 3,\n    semester: "First",\n',
);
replaceOnce(
  offeringsTest,
  'test("CreateOfferingInput requires both teaching-period dates", () => {\n  expect(CreateOfferingInput.safeParse(validCreate({ startDate: null })).success).toBe(false);\n  expect(CreateOfferingInput.safeParse(validCreate({ endDate: null })).success).toBe(false);\n  expect(CreateOfferingInput.safeParse(validCreate({ startDate: undefined, endDate: undefined })).success).toBe(false);\n});\n',
  'test("CreateOfferingInput rejects legacy teaching-period snapshots", () => {\n  expect(CreateOfferingInput.safeParse(validCreate({ startDate: "2026-08-10", endDate: "2026-11-28" })).success).toBe(false);\n  expect(CreateOfferingInput.safeParse(validCreate({ startDate: null, endDate: null })).success).toBe(false);\n});\n',
);
replaceOnce(
  offeringsTest,
  'test("CreateOfferingInput rejects a reversed teaching period", () => {\n  expect(CreateOfferingInput.safeParse(validCreate({\n    startDate: "2026-11-28",\n    endDate: "2026-08-10",\n  })).success).toBe(false);\n});\n',
  'test("CreateOfferingInput requires canonical Academic Calendar context", () => {\n  expect(CreateOfferingInput.safeParse(validCreate({ academicCalendarPeriodId: null })).success).toBe(false);\n  expect(CreateOfferingInput.safeParse(validCreate({ programmeYear: null })).success).toBe(false);\n  expect(CreateOfferingInput.safeParse(validCreate({ semester: null })).success).toBe(false);\n});\n',
);

const offeringService = "apps/backend/src/plugins/offerings/service.ts";
replaceOnce(
  offeringService,
  '        term: offeringInput.term,\n',
  '        // Term is a canonical display key derived from the published calendar, never trusted from the client.\n        term: `${period.academicYearLabel}-${period.semester === "First" ? "S1" : "S2"}`,\n',
);
replaceOnce(
  offeringService,
  '    const calendarContextChanging =\n      offeringInput.academicCalendarPeriodId !== undefined ||\n      offeringInput.programmeYear !== undefined ||\n      offeringInput.semester !== undefined;\n',
  '    const calendarContextChanging =\n      offeringInput.academicCalendarPeriodId !== undefined ||\n      offeringInput.programmeYear !== undefined ||\n      offeringInput.semester !== undefined ||\n      (existing.academicCalendarPeriodId !== null && offeringInput.term !== undefined);\n',
);
replaceOnce(
  offeringService,
  '          ...(offeringInput.term !== undefined ? { term: offeringInput.term } : {}),\n',
  '          ...(resolvedPeriod\n            ? { term: `${resolvedPeriod.academicYearLabel}-${resolvedPeriod.semester === "First" ? "S1" : "S2"}` }\n            : offeringInput.term !== undefined ? { term: offeringInput.term } : {}),\n',
);

const academicTypes = "packages/shared-types/src/academic-calendar.ts";
replaceOnce(
  academicTypes,
  'export interface AcademicCalendarSourceView { title: string; publishedAt: string | null; url: string | null; fileRef: string | null; note: string; }\n',
  'export interface AcademicCalendarSourceView { title: string; publishedAt: string | null; url: string | null; fileRef: string | null; note: string; }\nexport interface PublicAcademicCalendarSourceView { title: string; publishedAt: string | null; url: string | null; note: string; }\n',
);
replaceOnce(
  academicTypes,
  '| { status: "available"; academicYear: AcademicYearView; studyYear: number; periods: AcademicCalendarPeriodView[]; events: AcademicCalendarEventView[]; sources: AcademicCalendarSourceView[]; nextEvent: AcademicCalendarTimelineEvent | null; }\n',
  '| { status: "available"; academicYear: AcademicYearView; studyYear: number; periods: AcademicCalendarPeriodView[]; events: AcademicCalendarEventView[]; sources: PublicAcademicCalendarSourceView[]; nextEvent: AcademicCalendarTimelineEvent | null; }\n',
);

const calendarService = "apps/backend/src/plugins/programme/academic-calendar-service.ts";
replaceOnce(
  calendarService,
  '    const bySemester = new Map<string, AcademicCalendarPeriodView>(); const eventById = new Map<string, AcademicCalendarEventView>(); const sources = new Map<string, AcademicCalendarView["source"]>();\n',
  '    const bySemester = new Map<string, AcademicCalendarPeriodView>(); const eventById = new Map<string, AcademicCalendarEventView>(); const sources = new Map<string, Omit<AcademicCalendarView["source"], "fileRef">>();\n',
);
replaceOnce(
  calendarService,
  'for (const event of view.events) eventById.set(event.id, event); sources.set(row.id, view.source); }\n',
  'for (const event of view.events) eventById.set(event.id, event); const { fileRef: _internalFileRef, ...publicSource } = view.source; sources.set(row.id, publicSource); }\n',
);

const migration = "apps/backend/prisma/migrations/20260825162500_academic_calendar_epic_638/migration.sql";
replaceOnce(
  migration,
  '  CONSTRAINT "AcademicCalendar_published_source_check" CHECK ("status" <> \'Published\' OR length(btrim("sourceTitle")) > 0)\n',
  '  CONSTRAINT "AcademicCalendar_published_source_check" CHECK ("status" NOT IN (\'Published\', \'Superseded\') OR (length(btrim("sourceTitle")) > 0 AND "publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL AND (NULLIF(btrim("sourceUrl"), \'\') IS NOT NULL OR NULLIF(btrim("sourceFileRef"), \'\') IS NOT NULL OR length(btrim("sourceNote")) > 0)))\n',
);
replaceOnce(
  migration,
  `CREATE OR REPLACE FUNCTION guard_academic_calendar_child_mutation() RETURNS trigger AS $$\nDECLARE parent_status "AcademicCalendarStatus"; target_id TEXT;\nBEGIN\n  IF TG_OP = 'DELETE' THEN\n    target_id := OLD."calendarId";\n  ELSE\n    target_id := NEW."calendarId";\n  END IF;\n  SELECT "status" INTO parent_status FROM "AcademicCalendar" WHERE "id" = target_id;\n  IF parent_status <> 'Draft' THEN\n    RAISE EXCEPTION 'Only Draft academic calendar content may be changed';\n  END IF;\n  RETURN COALESCE(NEW, OLD);\nEND;\n$$ LANGUAGE plpgsql;\n`,
  `CREATE OR REPLACE FUNCTION guard_academic_calendar_child_mutation() RETURNS trigger AS $$\nDECLARE old_status "AcademicCalendarStatus"; new_status "AcademicCalendarStatus";\nBEGIN\n  IF TG_OP = 'INSERT' THEN\n    SELECT "status" INTO new_status FROM "AcademicCalendar" WHERE "id" = NEW."calendarId";\n    IF new_status <> 'Draft' THEN\n      RAISE EXCEPTION 'Only Draft academic calendar content may be changed';\n    END IF;\n    RETURN NEW;\n  ELSIF TG_OP = 'DELETE' THEN\n    SELECT "status" INTO old_status FROM "AcademicCalendar" WHERE "id" = OLD."calendarId";\n    IF old_status <> 'Draft' THEN\n      RAISE EXCEPTION 'Only Draft academic calendar content may be changed';\n    END IF;\n    RETURN OLD;\n  END IF;\n\n  SELECT "status" INTO old_status FROM "AcademicCalendar" WHERE "id" = OLD."calendarId";\n  SELECT "status" INTO new_status FROM "AcademicCalendar" WHERE "id" = NEW."calendarId";\n  IF old_status <> 'Draft' OR new_status <> 'Draft' THEN\n    RAISE EXCEPTION 'Only Draft academic calendar content may be changed';\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n`,
);
insertAfter(
  migration,
  `CREATE TRIGGER "AcademicCalendarAuditAction_append_only" BEFORE UPDATE OR DELETE ON "AcademicCalendarAuditAction" FOR EACH ROW EXECUTE FUNCTION prevent_academic_calendar_audit_mutation();\n`,
  `\n-- Calendar-linked offerings cannot carry shadow teaching dates. Completed offerings\n-- preserve their exact calendar/term context even if backend code attempts a direct update.\nCREATE OR REPLACE FUNCTION guard_offering_academic_calendar_integrity() RETURNS trigger AS $$\nBEGIN\n  IF NEW."academicCalendarPeriodId" IS NOT NULL AND (NEW."startDate" IS NOT NULL OR NEW."endDate" IS NOT NULL) THEN\n    RAISE EXCEPTION 'Calendar-linked offerings cannot store independent teaching dates';\n  END IF;\n\n  IF TG_OP = 'UPDATE' AND OLD."status" = 'Completed' AND (\n    NEW."academicCalendarPeriodId" IS DISTINCT FROM OLD."academicCalendarPeriodId" OR\n    NEW."semester" IS DISTINCT FROM OLD."semester" OR\n    NEW."programmeYear" IS DISTINCT FROM OLD."programmeYear" OR\n    NEW."term" IS DISTINCT FROM OLD."term"\n  ) THEN\n    RAISE EXCEPTION 'Completed offering academic-calendar context is historical and cannot be changed';\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\nCREATE TRIGGER "Offering_guard_academic_calendar_integrity" BEFORE INSERT OR UPDATE ON "Offering" FOR EACH ROW EXECUTE FUNCTION guard_offering_academic_calendar_integrity();\n`,
);
replaceOnce(
  migration,
  'REVOKE ALL PRIVILEGES ON FUNCTION prevent_academic_calendar_audit_mutation() FROM PUBLIC;\n',
  'REVOKE ALL PRIVILEGES ON FUNCTION prevent_academic_calendar_audit_mutation() FROM PUBLIC;\nREVOKE ALL PRIVILEGES ON FUNCTION guard_offering_academic_calendar_integrity() FROM PUBLIC;\n',
);
replaceOnce(
  migration,
  "guard_academic_calendar_publish_conflict(), prevent_academic_calendar_audit_mutation() FROM %I',\n",
  "guard_academic_calendar_publish_conflict(), prevent_academic_calendar_audit_mutation(), guard_offering_academic_calendar_integrity() FROM %I',\n",
);

const integrityTest = "apps/backend/src/plugins/programme/academic-calendar-integrity-db.test.ts";
replaceOnce(
  integrityTest,
  '    const original = await academicCalendarService.publishCalendar(course.programmeId, originalDraft.id, actor.id);\n    const originalPeriod = original.periods[0]!;\n\n',
  '    const original = await academicCalendarService.publishCalendar(course.programmeId, originalDraft.id, actor.id);\n    const originalPeriod = original.periods[0]!;\n\n    const moveTarget = await academicCalendarService.createCalendar(course.programmeId, actor.id, {\n      academicYearId: academicYear.id,\n      revisionReason: "Integrity move target",\n      studyYears: [3],\n      periods: [{ semester: "Second", teachingStart: "2199-02-01", teachingEnd: "2199-05-30" }],\n      events: [],\n      sourceTitle: "Draft move target",\n      sourcePublishedAt: null,\n      sourceUrl: null,\n      sourceFileRef: null,\n      sourceNote: "Draft only",\n    });\n    let publishedChildMoveRejected = false;\n    try {\n      await prisma.academicCalendarPeriod.update({ where: { id: originalPeriod.id }, data: { calendarId: moveTarget.id } });\n    } catch {\n      publishedChildMoveRejected = true;\n    }\n    expect(publishedChildMoveRejected).toBe(true);\n\n',
);
replaceOnce(
  integrityTest,
  '      sourceTitle: "Official calendar correction",\n      sourcePublishedAt: "2198-08-15",\n      sourceUrl: null,\n      sourceFileRef: null,\n      sourceNote: "Corrected official test source",\n',
  '      sourceTitle: "Official calendar correction",\n      sourcePublishedAt: "2198-08-15",\n      sourceUrl: null,\n      sourceFileRef: `internal/calendar/${suffix}.pdf`,\n      sourceNote: "Corrected official test source",\n',
);
replaceOnce(
  integrityTest,
  '    expect(completedAfter.academicCalendarPeriodId).toBe(originalPeriod.id);\n    expect(oldCalendar.status).toBe("Superseded");\n    expect(audit.some((row) => row.action === "OfferingRebound")).toBe(true);\n',
  '    expect(completedAfter.academicCalendarPeriodId).toBe(originalPeriod.id);\n    expect(oldCalendar.status).toBe("Superseded");\n    expect(audit.some((row) => row.action === "OfferingRebound")).toBe(true);\n\n    let completedRebindRejected = false;\n    try {\n      await prisma.offering.update({ where: { id: completed.id }, data: { academicCalendarPeriodId: replacementPeriod.id } });\n    } catch {\n      completedRebindRejected = true;\n    }\n    expect(completedRebindRejected).toBe(true);\n\n    let shadowDatesRejected = false;\n    try {\n      await prisma.offering.update({ where: { id: active.id }, data: { startDate: new Date("2198-09-09T00:00:00.000Z") } });\n    } catch {\n      shadowDatesRejected = true;\n    }\n    expect(shadowDatesRejected).toBe(true);\n\n    let auditRewriteRejected = false;\n    try {\n      await prisma.academicCalendarAuditAction.update({ where: { id: audit[0]!.id }, data: { reason: "rewritten" } });\n    } catch {\n      auditRewriteRejected = true;\n    }\n    expect(auditRewriteRejected).toBe(true);\n\n    const projection = await academicCalendarService.publishedProjection(course.programmeId, 3, academicYear.label);\n    expect(projection.status).toBe("available");\n    if (projection.status === "available") {\n      expect(projection.sources.length).toBeGreaterThan(0);\n      expect("fileRef" in projection.sources[0]!).toBe(false);\n    }\n',
);

const ci = ".github/workflows/ci.yml";
insertAfter(
  ci,
  `      - name: Verify Offering CourseSpec binding and historical result stability\n        run: bun test apps/backend/src/plugins/offerings/course-spec-binding-db.test.ts\n        env:\n          OFFERING_COURSE_SPEC_DB_TESTS: "1"\n          JWT_SECRET: issue-211-course-spec-binding-ci-secret-at-least-32-characters\n`,
  `\n      - name: Verify Academic Calendar revision and Offering history integrity\n        run: bun test apps/backend/src/plugins/programme/academic-calendar-integrity-db.test.ts\n        env:\n          ACADEMIC_CALENDAR_DB_TESTS: "1"\n\n      - name: Verify Student Portal Academic Calendar publication boundary\n        run: bun test apps/backend/src/plugins/student-portal/academic-calendar-db.test.ts\n        env:\n          ACADEMIC_CALENDAR_DB_TESTS: "1"\n`,
);

console.log("Epic #638 hardening patch applied.");
