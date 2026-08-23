-- Issue #564: privacy-preserving Telegram Mini App usage analytics.
-- This operational dataset shares the existing protected public_analytics schema
-- introduced for Ask DSE analytics. It is backend-only and must never become an
-- academic, attendance, grading, enrollment, or authorization source of truth.

CREATE TABLE public_analytics."TelegramUsageEvent" (
  "id" TEXT PRIMARY KEY,
  "programmeId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorRole" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "offeringId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramUsageEvent_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES public."Programme"("id") ON DELETE CASCADE,
  CONSTRAINT "TelegramUsageEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES public."User"("id") ON DELETE SET NULL,
  CONSTRAINT "TelegramUsageEvent_actorRole_check"
    CHECK ("actorRole" IN (
      'admin', 'program_coordinator', 'program_secretary', 'lecturer',
      'qa_contributor', 'qa_reviewer', 'student'
    )),
  CONSTRAINT "TelegramUsageEvent_eventType_check"
    CHECK ("eventType" IN (
      'MiniAppOpened', 'HomeViewed', 'ScheduleViewed', 'ClassViewed',
      'AnnouncementsViewed', 'ResultsViewed', 'SurveysViewed',
      'AssessmentDeadlinesViewed', 'AttendanceHistoryViewed',
      'LecturerWorkloadViewed', 'AttendanceRosterViewed'
    ))
);

CREATE INDEX "TelegramUsageEvent_programme_created_idx"
  ON public_analytics."TelegramUsageEvent"("programmeId", "createdAt" DESC);
CREATE INDEX "TelegramUsageEvent_programme_event_created_idx"
  ON public_analytics."TelegramUsageEvent"("programmeId", "eventType", "createdAt" DESC);
CREATE INDEX "TelegramUsageEvent_programme_actor_created_idx"
  ON public_analytics."TelegramUsageEvent"("programmeId", "actorUserId", "createdAt" DESC);

ALTER TABLE public_analytics."TelegramUsageEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public_analytics."TelegramUsageEvent" FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public_analytics."TelegramUsageEvent" FROM %I',
      api_role
    );
  END LOOP;
END
$$;
