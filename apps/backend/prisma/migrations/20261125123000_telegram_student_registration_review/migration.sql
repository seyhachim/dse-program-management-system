ALTER TABLE "telegram_security"."StudentRegistrationRequest"
  ADD COLUMN "approvedStudentId" TEXT UNIQUE REFERENCES public."Student"("id") ON DELETE RESTRICT;

CREATE TABLE "telegram_security"."StudentRegistrationReview" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "telegram_security"."StudentRegistrationRequest"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "decision" TEXT NOT NULL CHECK ("decision" IN ('APPROVE','REJECT','REQUEST_CORRECTION')),
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StudentRegistrationReview_request_created_idx" ON "telegram_security"."StudentRegistrationReview" ("requestId", "createdAt");
ALTER TABLE "telegram_security"."StudentRegistrationReview" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "telegram_security"."StudentRegistrationReview" FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "telegram_security"."StudentRegistrationReview" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
