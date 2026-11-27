-- Pending applications are backend-only, not canonical Student or User records.
CREATE TABLE "telegram_security"."StudentRegistrationRequest" (
  "id" TEXT PRIMARY KEY,
  "telegramUserId" TEXT NOT NULL UNIQUE,
  "programmeId" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "khmerFamilyName" TEXT NOT NULL,
  "khmerGivenName" TEXT NOT NULL,
  "latinFamilyName" TEXT NOT NULL,
  "latinGivenName" TEXT NOT NULL,
  "officialStudentId" TEXT,
  "email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING'
    CHECK ("status" IN ('PENDING', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationProgramme_fk" FOREIGN KEY ("programmeId") REFERENCES public."Programme"("id") ON DELETE RESTRICT,
  CONSTRAINT "RegistrationCohort_fk" FOREIGN KEY ("cohortId") REFERENCES public."StudentCohort"("id") ON DELETE RESTRICT,
  CONSTRAINT "RegistrationSection_fk" FOREIGN KEY ("sectionId") REFERENCES public."StudentCohortSection"("id") ON DELETE RESTRICT
);

CREATE INDEX "StudentRegistrationRequest_programme_status_created_idx"
ON "telegram_security"."StudentRegistrationRequest" ("programmeId", "status", "createdAt");

ALTER TABLE "telegram_security"."StudentRegistrationRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "telegram_security"."StudentRegistrationRequest" FROM PUBLIC;

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "telegram_security"."StudentRegistrationRequest" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
