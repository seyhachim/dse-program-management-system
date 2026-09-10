CREATE TABLE "FinalProjectSupervisorProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "programmeId" TEXT NOT NULL,
  "lecturerUserId" TEXT NOT NULL,
  "statement" TEXT NOT NULL DEFAULT '',
  "capacity" INTEGER NOT NULL DEFAULT 0,
  "acceptingStudents" BOOLEAN NOT NULL DEFAULT false,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinalProjectSupervisorProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalProjectSupervisorProfile_capacity_check" CHECK ("capacity" >= 0 AND "capacity" <= 20),
  CONSTRAINT "FinalProjectSupervisorProfile_accepting_capacity_check" CHECK (NOT "acceptingStudents" OR "capacity" > 0),
  CONSTRAINT "FinalProjectSupervisorProfile_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinalProjectSupervisorProfile_lecturerUserId_fkey" FOREIGN KEY ("lecturerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinalProjectSupervisorProfile_programmeId_lecturerUserId_key"
  ON "FinalProjectSupervisorProfile"("programmeId", "lecturerUserId");
CREATE INDEX "FinalProjectSupervisorProfile_programmeId_isPublished_acceptingStudents_idx"
  ON "FinalProjectSupervisorProfile"("programmeId", "isPublished", "acceptingStudents");
CREATE INDEX "FinalProjectSupervisorProfile_lecturerUserId_idx"
  ON "FinalProjectSupervisorProfile"("lecturerUserId");

CREATE TABLE "FinalProjectResearchTrack" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "supervisorProfileId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinalProjectResearchTrack_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalProjectResearchTrack_supervisorProfileId_fkey" FOREIGN KEY ("supervisorProfileId") REFERENCES "FinalProjectSupervisorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinalProjectResearchTrack_supervisorProfileId_title_key"
  ON "FinalProjectResearchTrack"("supervisorProfileId", "title");
CREATE INDEX "FinalProjectResearchTrack_supervisorProfileId_sortOrder_idx"
  ON "FinalProjectResearchTrack"("supervisorProfileId", "sortOrder");

CREATE TABLE "FinalProjectProjectIdea" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "researchTrackId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinalProjectProjectIdea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalProjectProjectIdea_researchTrackId_fkey" FOREIGN KEY ("researchTrackId") REFERENCES "FinalProjectResearchTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinalProjectProjectIdea_researchTrackId_title_key"
  ON "FinalProjectProjectIdea"("researchTrackId", "title");
CREATE INDEX "FinalProjectProjectIdea_researchTrackId_sortOrder_idx"
  ON "FinalProjectProjectIdea"("researchTrackId", "sortOrder");

CREATE TABLE "FinalProjectSupervisorProfileAudit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "supervisorProfileId" UUID NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinalProjectSupervisorProfileAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalProjectSupervisorProfileAudit_supervisorProfileId_fkey" FOREIGN KEY ("supervisorProfileId") REFERENCES "FinalProjectSupervisorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinalProjectSupervisorProfileAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FinalProjectSupervisorProfileAudit_supervisorProfileId_createdAt_idx"
  ON "FinalProjectSupervisorProfileAudit"("supervisorProfileId", "createdAt");
CREATE INDEX "FinalProjectSupervisorProfileAudit_actorId_createdAt_idx"
  ON "FinalProjectSupervisorProfileAudit"("actorId", "createdAt");

CREATE FUNCTION public.prevent_final_project_supervisor_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FinalProjectSupervisorProfileAudit is append-only';
END;
$$;

CREATE TRIGGER "FinalProjectSupervisorProfileAudit_append_only"
BEFORE UPDATE OR DELETE ON "FinalProjectSupervisorProfileAudit"
FOR EACH ROW EXECUTE FUNCTION public.prevent_final_project_supervisor_audit_mutation();

DO $$
DECLARE
  table_name text;
  api_role text;
  protected_tables constant text[] := ARRAY[
    'FinalProjectSupervisorProfile',
    'FinalProjectResearchTrack',
    'FinalProjectProjectIdea',
    'FinalProjectSupervisorProfileAudit'
  ];
BEGIN
  FOREACH table_name IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
  END LOOP;

  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    FOREACH table_name IN ARRAY protected_tables LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, api_role);
    END LOOP;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_final_project_supervisor_audit_mutation() FROM %I',
      api_role
    );
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_final_project_supervisor_audit_mutation() FROM PUBLIC;
