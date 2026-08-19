-- Additive lecturer-profile storage for AUN-QA staff metadata.
-- Identity/contact fields remain on User; this table stores lecturer-specific
-- professional metadata without rewriting existing users or teaching history.
CREATE TABLE "LecturerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gender" TEXT,
    "employmentType" TEXT,
    "fieldOfSpecialization" TEXT,
    "yearsOfExperience" INTEGER,
    "legacyCoursesTaught" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LecturerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LecturerProfile_userId_key" ON "LecturerProfile"("userId");

ALTER TABLE "LecturerProfile"
ADD CONSTRAINT "LecturerProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Public-schema PMS tables are backend-only. Keep this table aligned with the
-- repository's fail-closed database security baseline: RLS on, no Data API grants.
ALTER TABLE "LecturerProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "LecturerProfile" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'LecturerProfile', api_role);
  END LOOP;
END $$;
