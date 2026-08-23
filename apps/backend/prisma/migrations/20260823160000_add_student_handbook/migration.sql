CREATE SCHEMA IF NOT EXISTS student_handbook;

CREATE TABLE student_handbook."StudentHandbook" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "programmeId" TEXT NOT NULL REFERENCES public."Programme"("id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED')),
  "assignedLecturerId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "createdById" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "submittedAt" TIMESTAMPTZ,
  "approvedAt" TIMESTAMPTZ,
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("programmeId", "version")
);

CREATE TABLE student_handbook."StudentHandbookSection" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "handbookId" TEXT NOT NULL REFERENCES student_handbook."StudentHandbook"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("handbookId", "key"),
  UNIQUE ("handbookId", "sortOrder")
);

CREATE TABLE student_handbook."StudentHandbookBlock" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sectionId" TEXT NOT NULL REFERENCES student_handbook."StudentHandbookSection"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL CHECK ("type" IN ('NARRATIVE', 'SOURCE_DATA')),
  "sortOrder" INTEGER NOT NULL,
  "content" TEXT,
  "sourceKind" TEXT CHECK ("sourceKind" IS NULL OR "sourceKind" IN ('CURRICULUM_SUMMARY', 'PROGRAMME_PROFILE', 'PROGRAMME_CONTACT')),
  "label" TEXT,
  "sourceSnapshot" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("sectionId", "sortOrder"),
  CHECK (
    ("type" = 'NARRATIVE' AND "content" IS NOT NULL AND "sourceKind" IS NULL)
    OR
    ("type" = 'SOURCE_DATA' AND "sourceKind" IS NOT NULL AND "content" IS NULL)
  )
);

CREATE TABLE student_handbook."StudentHandbookAuditEvent" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "handbookId" TEXT NOT NULL REFERENCES student_handbook."StudentHandbook"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "details" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "StudentHandbook_programme_status_idx"
  ON student_handbook."StudentHandbook"("programmeId", "status");
CREATE INDEX "StudentHandbook_assignedLecturer_idx"
  ON student_handbook."StudentHandbook"("assignedLecturerId", "status");
CREATE INDEX "StudentHandbookSection_handbook_order_idx"
  ON student_handbook."StudentHandbookSection"("handbookId", "sortOrder");
CREATE INDEX "StudentHandbookBlock_section_order_idx"
  ON student_handbook."StudentHandbookBlock"("sectionId", "sortOrder");
CREATE INDEX "StudentHandbookAudit_handbook_created_idx"
  ON student_handbook."StudentHandbookAuditEvent"("handbookId", "createdAt");

CREATE OR REPLACE FUNCTION student_handbook.reject_published_handbook_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published student handbook versions are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "StudentHandbook_published_immutable"
BEFORE UPDATE OR DELETE ON student_handbook."StudentHandbook"
FOR EACH ROW EXECUTE FUNCTION student_handbook.reject_published_handbook_mutation();

CREATE OR REPLACE FUNCTION student_handbook.reject_published_section_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  handbook_status TEXT;
  target_handbook_id TEXT;
BEGIN
  target_handbook_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."handbookId" ELSE NEW."handbookId" END;
  SELECT "status" INTO handbook_status
  FROM student_handbook."StudentHandbook"
  WHERE "id" = target_handbook_id;
  IF handbook_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published student handbook content is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "StudentHandbookSection_published_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON student_handbook."StudentHandbookSection"
FOR EACH ROW EXECUTE FUNCTION student_handbook.reject_published_section_mutation();

CREATE OR REPLACE FUNCTION student_handbook.reject_published_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  handbook_status TEXT;
  target_section_id TEXT;
BEGIN
  target_section_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."sectionId" ELSE NEW."sectionId" END;
  SELECT h."status" INTO handbook_status
  FROM student_handbook."StudentHandbook" h
  JOIN student_handbook."StudentHandbookSection" s ON s."handbookId" = h."id"
  WHERE s."id" = target_section_id;
  IF handbook_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published student handbook content is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "StudentHandbookBlock_published_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON student_handbook."StudentHandbookBlock"
FOR EACH ROW EXECUTE FUNCTION student_handbook.reject_published_block_mutation();

CREATE OR REPLACE FUNCTION student_handbook.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Student handbook audit history is append-only';
END;
$$;

CREATE TRIGGER "StudentHandbookAudit_append_only"
BEFORE UPDATE OR DELETE ON student_handbook."StudentHandbookAuditEvent"
FOR EACH ROW EXECUTE FUNCTION student_handbook.reject_audit_mutation();

ALTER TABLE student_handbook."StudentHandbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_handbook."StudentHandbookSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_handbook."StudentHandbookBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_handbook."StudentHandbookAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA student_handbook FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA student_handbook FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA student_handbook FROM PUBLIC;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA student_handbook FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA student_handbook FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA student_handbook FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
