-- Issue #558: Year-4 graduation-project supervision across FPR401 -> FPR402/THE402/INT402.
--
-- This is a workflow/audit subdomain. Keep its tables outside Prisma's public
-- schema, following pms_attendance/curriculum_artifact, so canonical Programme,
-- Student, User, Cohort and Offering rows remain Prisma-owned while submitted
-- project evidence can be protected with database-level append-only rules.
CREATE SCHEMA IF NOT EXISTS graduation_projects;

REVOKE ALL ON SCHEMA graduation_projects FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA graduation_projects FROM %I', api_role);
  END LOOP;
END $$;

CREATE TABLE graduation_projects."GraduationProject" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cohortId" TEXT,
  "title" TEXT NOT NULL,
  "abstract" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'Proposed',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationProject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GraduationProject_programme_fkey" FOREIGN KEY ("programmeId") REFERENCES public."Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProject_cohort_fkey" FOREIGN KEY ("cohortId") REFERENCES public."StudentCohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProject_creator_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProject_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "GraduationProject_status_check" CHECK ("status" IN ('Proposed','Active','Completed','Archived'))
);
CREATE INDEX "GraduationProject_programme_status_idx" ON graduation_projects."GraduationProject"("programmeId", "status");
CREATE INDEX "GraduationProject_cohort_idx" ON graduation_projects."GraduationProject"("cohortId");

CREATE TABLE graduation_projects."GraduationProjectMember" (
  "projectId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'Member',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationProjectMember_pkey" PRIMARY KEY ("projectId", "studentId"),
  CONSTRAINT "GraduationProjectMember_project_fkey" FOREIGN KEY ("projectId") REFERENCES graduation_projects."GraduationProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectMember_student_fkey" FOREIGN KEY ("studentId") REFERENCES public."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectMember_role_check" CHECK ("role" IN ('Lead','Member'))
);
CREATE INDEX "GraduationProjectMember_student_idx" ON graduation_projects."GraduationProjectMember"("studentId");
CREATE UNIQUE INDEX "GraduationProjectMember_one_lead_key" ON graduation_projects."GraduationProjectMember"("projectId") WHERE "role" = 'Lead';

CREATE TABLE graduation_projects."GraduationProjectAdvisorAssignment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedById" TEXT,
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "GraduationProjectAdvisorAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GraduationProjectAdvisorAssignment_project_fkey" FOREIGN KEY ("projectId") REFERENCES graduation_projects."GraduationProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectAdvisorAssignment_lecturer_fkey" FOREIGN KEY ("lecturerId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectAdvisorAssignment_assigned_by_fkey" FOREIGN KEY ("assignedById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectAdvisorAssignment_ended_by_fkey" FOREIGN KEY ("endedById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectAdvisorAssignment_role_check" CHECK ("role" IN ('Primary','CoAdvisor')),
  CONSTRAINT "GraduationProjectAdvisorAssignment_end_check" CHECK (("endedAt" IS NULL AND "endedById" IS NULL) OR ("endedAt" IS NOT NULL AND "endedById" IS NOT NULL))
);
CREATE INDEX "GraduationProjectAdvisorAssignment_project_idx" ON graduation_projects."GraduationProjectAdvisorAssignment"("projectId", "endedAt");
CREATE INDEX "GraduationProjectAdvisorAssignment_lecturer_idx" ON graduation_projects."GraduationProjectAdvisorAssignment"("lecturerId", "endedAt");
CREATE UNIQUE INDEX "GraduationProjectAdvisorAssignment_active_primary_key" ON graduation_projects."GraduationProjectAdvisorAssignment"("projectId") WHERE "role" = 'Primary' AND "endedAt" IS NULL;
CREATE UNIQUE INDEX "GraduationProjectAdvisorAssignment_active_lecturer_key" ON graduation_projects."GraduationProjectAdvisorAssignment"("projectId", "lecturerId") WHERE "endedAt" IS NULL;

CREATE TABLE graduation_projects."GraduationProjectPhase" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Planned',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationProjectPhase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GraduationProjectPhase_project_fkey" FOREIGN KEY ("projectId") REFERENCES graduation_projects."GraduationProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectPhase_offering_fkey" FOREIGN KEY ("offeringId") REFERENCES public."Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectPhase_creator_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectPhase_kind_check" CHECK ("kind" IN ('FPR401','FPR402','THE402','INT402')),
  CONSTRAINT "GraduationProjectPhase_status_check" CHECK ("status" IN ('Planned','Active','Completed')),
  CONSTRAINT "GraduationProjectPhase_dates_check" CHECK ("completedAt" IS NULL OR "startedAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "GraduationProjectPhase_project_offering_key" ON graduation_projects."GraduationProjectPhase"("projectId", "offeringId");
CREATE UNIQUE INDEX "GraduationProjectPhase_project_kind_key" ON graduation_projects."GraduationProjectPhase"("projectId", "kind");
CREATE UNIQUE INDEX "GraduationProjectPhase_sem2_key" ON graduation_projects."GraduationProjectPhase"("projectId") WHERE "kind" IN ('FPR402','THE402','INT402');

CREATE TABLE graduation_projects."GraduationProjectMilestone" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "phaseId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'Open',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationProjectMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GraduationProjectMilestone_project_fkey" FOREIGN KEY ("projectId") REFERENCES graduation_projects."GraduationProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectMilestone_phase_fkey" FOREIGN KEY ("phaseId") REFERENCES graduation_projects."GraduationProjectPhase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectMilestone_creator_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectMilestone_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "GraduationProjectMilestone_status_check" CHECK ("status" IN ('Planned','Open','Submitted','Reviewed','Completed')),
  CONSTRAINT "GraduationProjectMilestone_sort_check" CHECK ("sortOrder" >= 0)
);
CREATE INDEX "GraduationProjectMilestone_project_idx" ON graduation_projects."GraduationProjectMilestone"("projectId", "sortOrder", "createdAt");

CREATE TABLE graduation_projects."GraduationProjectSubmission" (
  "id" TEXT NOT NULL,
  "milestoneId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "submittedByStudentId" TEXT NOT NULL,
  "artifactUrl" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationProjectSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GraduationProjectSubmission_milestone_fkey" FOREIGN KEY ("milestoneId") REFERENCES graduation_projects."GraduationProjectMilestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectSubmission_student_fkey" FOREIGN KEY ("submittedByStudentId") REFERENCES public."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectSubmission_version_check" CHECK ("version" > 0),
  CONSTRAINT "GraduationProjectSubmission_artifact_check" CHECK (length(btrim("artifactUrl")) > 0)
);
CREATE UNIQUE INDEX "GraduationProjectSubmission_milestone_version_key" ON graduation_projects."GraduationProjectSubmission"("milestoneId", "version");

CREATE TABLE graduation_projects."GraduationProjectReview" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationProjectReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GraduationProjectReview_submission_fkey" FOREIGN KEY ("submissionId") REFERENCES graduation_projects."GraduationProjectSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectReview_reviewer_fkey" FOREIGN KEY ("reviewerId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectReview_decision_check" CHECK ("decision" IN ('ChangesRequested','Approved'))
);
CREATE INDEX "GraduationProjectReview_submission_idx" ON graduation_projects."GraduationProjectReview"("submissionId", "createdAt");

CREATE TABLE graduation_projects."GraduationProjectMeeting" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "discussion" TEXT NOT NULL DEFAULT '',
  "recommendations" TEXT NOT NULL DEFAULT '',
  "nextActions" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationProjectMeeting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GraduationProjectMeeting_project_fkey" FOREIGN KEY ("projectId") REFERENCES graduation_projects."GraduationProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectMeeting_creator_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GraduationProjectMeeting_project_idx" ON graduation_projects."GraduationProjectMeeting"("projectId", "occurredAt");

CREATE TABLE graduation_projects."GraduationProjectAuditEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationProjectAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GraduationProjectAuditEvent_project_fkey" FOREIGN KEY ("projectId") REFERENCES graduation_projects."GraduationProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectAuditEvent_actor_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GraduationProjectAuditEvent_action_check" CHECK (length(btrim("action")) > 0)
);
CREATE INDEX "GraduationProjectAuditEvent_project_idx" ON graduation_projects."GraduationProjectAuditEvent"("projectId", "createdAt");

-- Prevent a milestone from pointing at another project's phase.
CREATE OR REPLACE FUNCTION graduation_projects."validate_milestone_phase"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."phaseId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM graduation_projects."GraduationProjectPhase" p
    WHERE p."id" = NEW."phaseId" AND p."projectId" = NEW."projectId"
  ) THEN
    RAISE EXCEPTION 'Milestone phase does not belong to this graduation project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "GraduationProjectMilestone_validate_phase"
BEFORE INSERT OR UPDATE ON graduation_projects."GraduationProjectMilestone"
FOR EACH ROW EXECUTE FUNCTION graduation_projects."validate_milestone_phase"();

-- Advisor assignments are historical records: identity/role cannot be rewritten,
-- an active assignment can only be ended once, and rows cannot be deleted.
CREATE OR REPLACE FUNCTION graduation_projects."protect_advisor_assignment"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Graduation-project advisor assignments are immutable';
  END IF;
  IF OLD."projectId" <> NEW."projectId"
     OR OLD."lecturerId" <> NEW."lecturerId"
     OR OLD."role" <> NEW."role"
     OR OLD."assignedById" <> NEW."assignedById"
     OR OLD."assignedAt" <> NEW."assignedAt" THEN
    RAISE EXCEPTION 'Graduation-project advisor assignment identity is immutable';
  END IF;
  IF OLD."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Ended graduation-project advisor assignments are immutable';
  END IF;
  IF NEW."endedAt" IS NULL OR NEW."endedById" IS NULL THEN
    RAISE EXCEPTION 'Advisor assignment updates may only end the assignment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "GraduationProjectAdvisorAssignment_protect"
BEFORE UPDATE OR DELETE ON graduation_projects."GraduationProjectAdvisorAssignment"
FOR EACH ROW EXECUTE FUNCTION graduation_projects."protect_advisor_assignment"();

-- Student submissions, advisor reviews, supervision meeting notes and audit
-- events are evidence. Corrections are represented by a new version/event.
CREATE OR REPLACE FUNCTION graduation_projects."prevent_evidence_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Submitted graduation-project evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GraduationProjectSubmission_append_only" BEFORE UPDATE OR DELETE ON graduation_projects."GraduationProjectSubmission" FOR EACH ROW EXECUTE FUNCTION graduation_projects."prevent_evidence_mutation"();
CREATE TRIGGER "GraduationProjectReview_append_only" BEFORE UPDATE OR DELETE ON graduation_projects."GraduationProjectReview" FOR EACH ROW EXECUTE FUNCTION graduation_projects."prevent_evidence_mutation"();
CREATE TRIGGER "GraduationProjectMeeting_append_only" BEFORE UPDATE OR DELETE ON graduation_projects."GraduationProjectMeeting" FOR EACH ROW EXECUTE FUNCTION graduation_projects."prevent_evidence_mutation"();
CREATE TRIGGER "GraduationProjectAuditEvent_append_only" BEFORE UPDATE OR DELETE ON graduation_projects."GraduationProjectAuditEvent" FOR EACH ROW EXECUTE FUNCTION graduation_projects."prevent_evidence_mutation"();

ALTER TABLE graduation_projects."GraduationProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_projects."GraduationProjectMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_projects."GraduationProjectAdvisorAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_projects."GraduationProjectPhase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_projects."GraduationProjectMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_projects."GraduationProjectSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_projects."GraduationProjectReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_projects."GraduationProjectMeeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_projects."GraduationProjectAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA graduation_projects FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA graduation_projects FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA graduation_projects FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA graduation_projects FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA graduation_projects FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA graduation_projects FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA graduation_projects REVOKE ALL ON TABLES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA graduation_projects REVOKE ALL ON SEQUENCES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA graduation_projects REVOKE ALL ON FUNCTIONS FROM %I', api_role);
  END LOOP;
END $$;
