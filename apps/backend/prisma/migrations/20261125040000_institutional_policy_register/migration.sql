-- Additive backend-only policy register; contains no restricted source material.
CREATE TABLE "InstitutionalPolicyRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "programmeId" TEXT NOT NULL,
  "topic" TEXT NOT NULL CHECK ("topic" IN ('obe','ai','grade_appeal','data_protection')),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "title" TEXT NOT NULL CHECK (length(btrim("title")) > 0),
  "institutionalOwner" TEXT NOT NULL CHECK (length(btrim("institutionalOwner")) > 0),
  "version" TEXT,
  "effectiveDate" TEXT,
  "locator" TEXT,
  "modules" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('pending','verified','archived')),
  "classification" TEXT NOT NULL DEFAULT 'internal_staff' CHECK ("classification" = 'internal_staff'),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  CHECK (("status" = 'verified' AND "verifiedAt" IS NOT NULL AND "version" IS NOT NULL AND "locator" IS NOT NULL) OR ("status" <> 'verified' AND "verifiedAt" IS NULL)),
  CONSTRAINT "InstitutionalPolicyRevision_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalPolicyRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InstitutionalPolicyRevision_programmeId_topic_revision_key" ON "InstitutionalPolicyRevision"("programmeId","topic","revision");
ALTER TABLE "InstitutionalPolicyRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InstitutionalPolicyRevision" FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "InstitutionalPolicyRevision" FROM %I', r);
    END IF;
  END LOOP;
END $$;
