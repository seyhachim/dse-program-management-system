-- Issue #1006: Final Project plugin foundation & Supervisor Discovery MVP.
-- Discovery data is isolated from User/Lecturer identity records and from future
-- advisor assignment/application workflow. Current workload is intentionally not stored here.

CREATE SCHEMA IF NOT EXISTS final_project;
REVOKE ALL ON SCHEMA final_project FROM PUBLIC;

CREATE TABLE final_project."SupervisorProfile" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "supervisionStatement" TEXT NOT NULL DEFAULT '',
  "capacity" INTEGER NOT NULL DEFAULT 0,
  "acceptingStudents" BOOLEAN NOT NULL DEFAULT false,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupervisorProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupervisorProfile_programme_lecturer_key" UNIQUE ("programmeId", "lecturerId"),
  CONSTRAINT "SupervisorProfile_capacity_check" CHECK ("capacity" >= 0 AND "capacity" <= 50),
  CONSTRAINT "SupervisorProfile_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES public."Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupervisorProfile_lecturerId_fkey"
    FOREIGN KEY ("lecturerId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE final_project."ResearchTrack" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ResearchTrack_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResearchTrack_profile_name_key" UNIQUE ("profileId", "name"),
  CONSTRAINT "ResearchTrack_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES final_project."SupervisorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE final_project."ProjectIdea" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "trackName" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectIdea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectIdea_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES final_project."SupervisorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SupervisorProfile_programme_published_accepting_idx"
  ON final_project."SupervisorProfile"("programmeId", "isPublished", "acceptingStudents");
CREATE INDEX "ResearchTrack_profile_sort_idx"
  ON final_project."ResearchTrack"("profileId", "sortOrder");
CREATE INDEX "ProjectIdea_profile_sort_idx"
  ON final_project."ProjectIdea"("profileId", "sortOrder");

ALTER TABLE final_project."SupervisorProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_project."ResearchTrack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_project."ProjectIdea" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE final_project."SupervisorProfile" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE final_project."ResearchTrack" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE final_project."ProjectIdea" FROM PUBLIC;

-- The Express API owns authorization. Supabase client roles must not bypass it.
DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA final_project FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE final_project.%I FROM %I', 'SupervisorProfile', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE final_project.%I FROM %I', 'ResearchTrack', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE final_project.%I FROM %I', 'ProjectIdea', api_role);
  END LOOP;
END
$$;
