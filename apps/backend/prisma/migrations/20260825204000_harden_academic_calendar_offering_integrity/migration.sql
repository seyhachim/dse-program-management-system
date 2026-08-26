-- Harden the canonical Academic Calendar -> Offering boundary after the additive #638 foundation.
-- Existing calendar-linked rows may remain on Superseded revisions for history, but new/rebound links must target Published periods.

CREATE OR REPLACE FUNCTION guard_offering_academic_calendar_integrity() RETURNS trigger AS $$
DECLARE
  target_status "AcademicCalendarStatus";
  target_semester "Semester";
  target_year_label TEXT;
  target_programme_id TEXT;
  course_programme_id TEXT;
  target_study_year_ok BOOLEAN;
  expected_term TEXT;
  period_changed BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."academicCalendarPeriodId" IS NOT NULL AND NEW."academicCalendarPeriodId" IS NULL THEN
    RAISE EXCEPTION 'Calendar-linked offerings cannot be detached from their canonical academic period';
  END IF;

  IF NEW."academicCalendarPeriodId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."startDate" IS NOT NULL OR NEW."endDate" IS NOT NULL THEN
    RAISE EXCEPTION 'Calendar-linked offerings cannot store independent teaching dates';
  END IF;

  SELECT ac."status", p."semester", ay."label", ay."programmeId", c."programmeId",
         EXISTS (
           SELECT 1 FROM "AcademicCalendarStudyYear" sy
           WHERE sy."calendarId" = ac."id" AND sy."studyYear" = NEW."programmeYear"
         )
  INTO target_status, target_semester, target_year_label, target_programme_id, course_programme_id, target_study_year_ok
  FROM "AcademicCalendarPeriod" p
  JOIN "AcademicCalendar" ac ON ac."id" = p."calendarId"
  JOIN "AcademicYear" ay ON ay."id" = ac."academicYearId"
  JOIN "Course" c ON c."id" = NEW."courseId"
  WHERE p."id" = NEW."academicCalendarPeriodId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic Calendar period or Offering course does not exist';
  END IF;

  IF TG_OP = 'INSERT' THEN
    period_changed := TRUE;
  ELSE
    period_changed := NEW."academicCalendarPeriodId" IS DISTINCT FROM OLD."academicCalendarPeriodId";
  END IF;

  IF period_changed AND target_status <> 'Published' THEN
    RAISE EXCEPTION 'New or rebound Offering links require a Published Academic Calendar period';
  END IF;
  IF NOT period_changed AND target_status NOT IN ('Published', 'Superseded') THEN
    RAISE EXCEPTION 'Calendar-linked Offering history must reference a Published or Superseded Academic Calendar';
  END IF;
  IF target_programme_id IS DISTINCT FROM course_programme_id THEN
    RAISE EXCEPTION 'Offering course and Academic Calendar must belong to the same programme';
  END IF;
  IF NEW."programmeYear" IS NULL OR NOT target_study_year_ok THEN
    RAISE EXCEPTION 'Offering study year is not covered by the Academic Calendar';
  END IF;
  IF NEW."semester" IS DISTINCT FROM target_semester THEN
    RAISE EXCEPTION 'Offering semester must match the Academic Calendar period';
  END IF;

  expected_term := target_year_label || CASE WHEN target_semester = 'First' THEN '-S1' ELSE '-S2' END;
  IF NEW."term" IS DISTINCT FROM expected_term THEN
    RAISE EXCEPTION 'Offering term must be derived from the Academic Calendar';
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

REVOKE ALL PRIVILEGES ON FUNCTION guard_offering_academic_calendar_integrity() FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION guard_offering_academic_calendar_integrity() FROM %I', api_role);
  END LOOP;
END
$$;
