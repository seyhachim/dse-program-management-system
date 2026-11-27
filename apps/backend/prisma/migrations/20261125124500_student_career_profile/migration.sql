-- Draft registration has never been released. Preserve historical canonical Student email policy.
ALTER TABLE "telegram_security"."StudentRegistrationRequest"
  ALTER COLUMN "email" SET NOT NULL,
  ADD CONSTRAINT "RegistrationUniversityEmail_check"
    CHECK ("email" ~* '^[^@[:space:]]+@rupp[.]edu[.]kh$'),
  ADD COLUMN "careerProfile" JSONB;

CREATE TABLE public."StudentCareerProfile" (
  "studentId" TEXT PRIMARY KEY REFERENCES public."Student"("id") ON DELETE CASCADE,
  "preferences" JSONB NOT NULL CHECK (jsonb_typeof("preferences") = 'object'),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public."StudentCareerProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."StudentCareerProfile" FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."StudentCareerProfile" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
