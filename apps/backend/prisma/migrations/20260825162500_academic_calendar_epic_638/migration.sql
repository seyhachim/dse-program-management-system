-- Epic #638: canonical programme Academic Calendar with immutable published revisions.

CREATE TYPE "AcademicCalendarStatus" AS ENUM ('Draft', 'Published', 'Superseded', 'Archived');
CREATE TYPE "AcademicCalendarEventType" AS ENUM ('Registration', 'Enrollment', 'Orientation', 'EntranceExam', 'SemesterStart', 'Teaching', 'Midterm', 'FinalExam', 'SemesterBreak', 'Holiday', 'Other');
CREATE TYPE "AcademicCalendarAuditActionType" AS ENUM ('Created', 'Updated', 'Published', 'RevisionCreated', 'Superseded', 'Archived', 'OfferingRebound');

CREATE TABLE "AcademicYear" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startYear" INTEGER NOT NULL,
  "endYear" INTEGER NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicYear_year_order_check" CHECK ("endYear" >= "startYear")
);

CREATE TABLE "AcademicCalendar" (
  "id" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "seriesKey" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "status" "AcademicCalendarStatus" NOT NULL DEFAULT 'Draft',
  "sourceTitle" TEXT NOT NULL DEFAULT '',
  "sourcePublishedAt" DATE,
  "sourceUrl" TEXT,
  "sourceFileRef" TEXT,
  "sourceNote" TEXT NOT NULL DEFAULT '',
  "revisionReason" TEXT NOT NULL DEFAULT '',
  "supersedesCalendarId" TEXT,
  "createdById" TEXT NOT NULL,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicCalendar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicCalendar_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "AcademicCalendar_published_source_check" CHECK ("status" NOT IN ('Published', 'Superseded') OR (length(btrim("sourceTitle")) > 0 AND "publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL AND (NULLIF(btrim("sourceUrl"), '') IS NOT NULL OR NULLIF(btrim("sourceFileRef"), '') IS NOT NULL OR length(btrim("sourceNote")) > 0)))
);

CREATE TABLE "AcademicCalendarStudyYear" (
  "calendarId" TEXT NOT NULL,
  "studyYear" INTEGER NOT NULL,
  CONSTRAINT "AcademicCalendarStudyYear_pkey" PRIMARY KEY ("calendarId", "studyYear"),
  CONSTRAINT "AcademicCalendarStudyYear_range_check" CHECK ("studyYear" BETWEEN 1 AND 4)
);

CREATE TABLE "AcademicCalendarPeriod" (
  "id" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "semester" "Semester" NOT NULL,
  "teachingStart" DATE NOT NULL,
  "teachingEnd" DATE NOT NULL,
  "examStart" DATE,
  "examEnd" DATE,
  "breakStart" DATE,
  "breakEnd" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicCalendarPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicCalendarPeriod_teaching_order_check" CHECK ("teachingStart" <= "teachingEnd"),
  CONSTRAINT "AcademicCalendarPeriod_exam_pair_check" CHECK (("examStart" IS NULL AND "examEnd" IS NULL) OR ("examStart" IS NOT NULL AND "examEnd" IS NOT NULL AND "examStart" <= "examEnd")),
  CONSTRAINT "AcademicCalendarPeriod_break_pair_check" CHECK (("breakStart" IS NULL AND "breakEnd" IS NULL) OR ("breakStart" IS NOT NULL AND "breakEnd" IS NOT NULL AND "breakStart" <= "breakEnd"))
);

CREATE TABLE "AcademicCalendarEvent" (
  "id" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "AcademicCalendarEventType" NOT NULL,
  "semester" "Semester",
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "note" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicCalendarEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicCalendarEvent_date_order_check" CHECK ("endDate" IS NULL OR "startDate" <= "endDate")
);

CREATE TABLE "AcademicCalendarAuditAction" (
  "id" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" "AcademicCalendarAuditActionType" NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicCalendarAuditAction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Offering" ADD COLUMN "academicCalendarPeriodId" TEXT;

CREATE UNIQUE INDEX "AcademicYear_programmeId_label_key" ON "AcademicYear"("programmeId", "label");
CREATE UNIQUE INDEX "AcademicYear_programmeId_startYear_endYear_key" ON "AcademicYear"("programmeId", "startYear", "endYear");
CREATE UNIQUE INDEX "AcademicYear_one_current_per_programme" ON "AcademicYear"("programmeId") WHERE "isCurrent" = true;
CREATE INDEX "AcademicYear_programmeId_isCurrent_idx" ON "AcademicYear"("programmeId", "isCurrent");
CREATE UNIQUE INDEX "AcademicCalendar_academicYearId_seriesKey_revision_key" ON "AcademicCalendar"("academicYearId", "seriesKey", "revision");
CREATE INDEX "AcademicCalendar_academicYearId_status_idx" ON "AcademicCalendar"("academicYearId", "status");
CREATE INDEX "AcademicCalendar_supersedesCalendarId_idx" ON "AcademicCalendar"("supersedesCalendarId");
CREATE INDEX "AcademicCalendar_createdById_idx" ON "AcademicCalendar"("createdById");
CREATE INDEX "AcademicCalendar_publishedById_idx" ON "AcademicCalendar"("publishedById");
CREATE INDEX "AcademicCalendarStudyYear_studyYear_calendarId_idx" ON "AcademicCalendarStudyYear"("studyYear", "calendarId");
CREATE UNIQUE INDEX "AcademicCalendarPeriod_calendarId_semester_key" ON "AcademicCalendarPeriod"("calendarId", "semester");
CREATE INDEX "AcademicCalendarPeriod_semester_teachingStart_teachingEnd_idx" ON "AcademicCalendarPeriod"("semester", "teachingStart", "teachingEnd");
CREATE INDEX "AcademicCalendarEvent_calendarId_startDate_sortOrder_idx" ON "AcademicCalendarEvent"("calendarId", "startDate", "sortOrder");
CREATE INDEX "AcademicCalendarAuditAction_calendarId_createdAt_idx" ON "AcademicCalendarAuditAction"("calendarId", "createdAt");
CREATE INDEX "AcademicCalendarAuditAction_actorId_idx" ON "AcademicCalendarAuditAction"("actorId");
CREATE INDEX "Offering_academicCalendarPeriodId_idx" ON "Offering"("academicCalendarPeriodId");

ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_supersedesCalendarId_fkey" FOREIGN KEY ("supersedesCalendarId") REFERENCES "AcademicCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarStudyYear" ADD CONSTRAINT "AcademicCalendarStudyYear_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "AcademicCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarPeriod" ADD CONSTRAINT "AcademicCalendarPeriod_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "AcademicCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarEvent" ADD CONSTRAINT "AcademicCalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "AcademicCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarAuditAction" ADD CONSTRAINT "AcademicCalendarAuditAction_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "AcademicCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicCalendarAuditAction" ADD CONSTRAINT "AcademicCalendarAuditAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_academicCalendarPeriodId_fkey" FOREIGN KEY ("academicCalendarPeriodId") REFERENCES "AcademicCalendarPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Published/superseded calendar content is immutable. The only allowed update to
-- an already-published parent is Published -> Superseded; child tables remain frozen.
CREATE OR REPLACE FUNCTION guard_academic_calendar_parent_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" IN ('Published', 'Superseded') THEN
    RAISE EXCEPTION 'Published academic calendar history is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('Published', 'Superseded') THEN
    IF OLD."status" = 'Published' AND NEW."status" = 'Superseded'
       AND (to_jsonb(NEW) - ARRAY['status','updatedAt']) = (to_jsonb(OLD) - ARRAY['status','updatedAt']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Published academic calendar history is immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AcademicCalendar_guard_published_mutation" BEFORE UPDATE OR DELETE ON "AcademicCalendar" FOR EACH ROW EXECUTE FUNCTION guard_academic_calendar_parent_mutation();

CREATE OR REPLACE FUNCTION guard_academic_calendar_child_mutation() RETURNS trigger AS $$
DECLARE old_status "AcademicCalendarStatus"; new_status "AcademicCalendarStatus";
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "status" INTO new_status FROM "AcademicCalendar" WHERE "id" = NEW."calendarId";
    IF new_status <> 'Draft' THEN
      RAISE EXCEPTION 'Only Draft academic calendar content may be changed';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT "status" INTO old_status FROM "AcademicCalendar" WHERE "id" = OLD."calendarId";
    IF old_status <> 'Draft' THEN
      RAISE EXCEPTION 'Only Draft academic calendar content may be changed';
    END IF;
    RETURN OLD;
  END IF;

  SELECT "status" INTO old_status FROM "AcademicCalendar" WHERE "id" = OLD."calendarId";
  SELECT "status" INTO new_status FROM "AcademicCalendar" WHERE "id" = NEW."calendarId";
  IF old_status <> 'Draft' OR new_status <> 'Draft' THEN
    RAISE EXCEPTION 'Only Draft academic calendar content may be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AcademicCalendarStudyYear_guard_mutation" BEFORE INSERT OR UPDATE OR DELETE ON "AcademicCalendarStudyYear" FOR EACH ROW EXECUTE FUNCTION guard_academic_calendar_child_mutation();
CREATE TRIGGER "AcademicCalendarPeriod_guard_mutation" BEFORE INSERT OR UPDATE OR DELETE ON "AcademicCalendarPeriod" FOR EACH ROW EXECUTE FUNCTION guard_academic_calendar_child_mutation();
CREATE TRIGGER "AcademicCalendarEvent_guard_mutation" BEFORE INSERT OR UPDATE OR DELETE ON "AcademicCalendarEvent" FOR EACH ROW EXECUTE FUNCTION guard_academic_calendar_child_mutation();

CREATE OR REPLACE FUNCTION guard_academic_calendar_publish_conflict() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'Published' AND OLD."status" <> 'Published' THEN
    IF EXISTS (
      SELECT 1
      FROM "AcademicCalendarStudyYear" sy
      JOIN "AcademicCalendarPeriod" p ON p."calendarId" = NEW."id"
      JOIN "AcademicCalendar" other ON other."academicYearId" = NEW."academicYearId" AND other."status" = 'Published' AND other."id" <> NEW."id"
      JOIN "AcademicCalendarStudyYear" osy ON osy."calendarId" = other."id" AND osy."studyYear" = sy."studyYear"
      JOIN "AcademicCalendarPeriod" op ON op."calendarId" = other."id" AND op."semester" = p."semester"
      WHERE sy."calendarId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'Conflicting published academic calendar exists for this academic context';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AcademicCalendar_guard_publish_conflict" BEFORE UPDATE OF "status" ON "AcademicCalendar" FOR EACH ROW EXECUTE FUNCTION guard_academic_calendar_publish_conflict();

CREATE OR REPLACE FUNCTION prevent_academic_calendar_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Academic calendar audit history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AcademicCalendarAuditAction_append_only" BEFORE UPDATE OR DELETE ON "AcademicCalendarAuditAction" FOR EACH ROW EXECUTE FUNCTION prevent_academic_calendar_audit_mutation();

-- Calendar-linked offerings cannot carry shadow teaching dates. Completed offerings
-- preserve their exact calendar/term context even if backend code attempts a direct update.
CREATE OR REPLACE FUNCTION guard_offering_academic_calendar_integrity() RETURNS trigger AS $$
BEGIN
  IF NEW."academicCalendarPeriodId" IS NOT NULL AND (NEW."startDate" IS NOT NULL OR NEW."endDate" IS NOT NULL) THEN
    RAISE EXCEPTION 'Calendar-linked offerings cannot store independent teaching dates';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'Completed' AND (
    NEW."academicCalendarPeriodId" IS DISTINCT FROM OLD."academicCalendarPeriodId" OR
    NEW."semester" IS DISTINCT FROM OLD."semester" OR
    NEW."programmeYear" IS DISTINCT FROM OLD."programmeYear" OR
    NEW."term" IS DISTINCT FROM OLD."term"
  ) THEN
    RAISE EXCEPTION 'Completed offering academic-calendar context is historical and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Offering_guard_academic_calendar_integrity" BEFORE INSERT OR UPDATE ON "Offering" FOR EACH ROW EXECUTE FUNCTION guard_offering_academic_calendar_integrity();

-- Supabase Data API boundary: backend-owned academic calendar tables are not
-- directly readable/writable by anon/authenticated/service_role roles. All
-- access goes through permission-checked PMS APIs. Supabase-specific roles are
-- optional in ordinary PostgreSQL, so references to them are guarded via pg_roles.
ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicCalendar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicCalendarStudyYear" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicCalendarPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicCalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicCalendarAuditAction" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "AcademicYear" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AcademicCalendar" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AcademicCalendarStudyYear" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AcademicCalendarPeriod" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AcademicCalendarEvent" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AcademicCalendarAuditAction" FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION guard_academic_calendar_parent_mutation() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION guard_academic_calendar_child_mutation() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION guard_academic_calendar_publish_conflict() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION prevent_academic_calendar_audit_mutation() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION guard_offering_academic_calendar_integrity() FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE "AcademicYear", "AcademicCalendar", "AcademicCalendarStudyYear", "AcademicCalendarPeriod", "AcademicCalendarEvent", "AcademicCalendarAuditAction" FROM %I',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION guard_academic_calendar_parent_mutation(), guard_academic_calendar_child_mutation(), guard_academic_calendar_publish_conflict(), prevent_academic_calendar_audit_mutation(), guard_offering_academic_calendar_integrity() FROM %I',
      api_role
    );
  END LOOP;
END
$$;
