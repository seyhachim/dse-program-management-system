CREATE TABLE "knowledge_sources" (
  "id" TEXT PRIMARY KEY,
  "programme_id" TEXT NOT NULL,
  "domain" TEXT NOT NULL CHECK ("domain" IN ('AUN_QA','CAMBODIA_OBE','RUPP','FACULTY_ENGINEERING','DSE')),
  "title" TEXT NOT NULL,
  "short_title" TEXT,
  "issuing_organisation" TEXT NOT NULL,
  "source_type" TEXT NOT NULL CHECK ("source_type" IN (
    'OFFICIAL_FRAMEWORK','REGULATION_POLICY','GUIDELINE_PLAYBOOK','OFFICIAL_STANDARD',
    'UNIVERSITY_POLICY','FACULTY_POLICY_PROCEDURE','APPROVED_PROGRAMME_SPECIFICATION',
    'APPROVED_CURRICULUM','APPROVED_ACADEMIC_DOCUMENT','OFFICIAL_WEBPAGE',
    'TRUSTED_EXTERNAL_REFERENCE','WORKING_REFERENCE'
  )),
  "trust_category" TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK ("trust_category" IN (
    'AUTHORITATIVE','INSTITUTIONAL_OFFICIAL','TRUSTED_REFERENCE','WORKING_REFERENCE','UNVERIFIED'
  )),
  "access_classification" TEXT NOT NULL DEFAULT 'INTERNAL' CHECK ("access_classification" IN ('PUBLIC','INTERNAL','RESTRICTED')),
  "jurisdiction_scope" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_sources_programme_fk" FOREIGN KEY ("programme_id") REFERENCES "Programme"("id") ON DELETE RESTRICT,
  CONSTRAINT "knowledge_sources_created_by_fk" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "knowledge_sources_programme_domain_idx"
  ON "knowledge_sources" ("programme_id", "domain");
CREATE INDEX "knowledge_sources_programme_trust_idx"
  ON "knowledge_sources" ("programme_id", "trust_category");

CREATE TABLE "knowledge_source_versions" (
  "id" TEXT PRIMARY KEY,
  "source_id" TEXT NOT NULL,
  "version_label" TEXT NOT NULL,
  "publication_date" DATE,
  "effective_date" DATE,
  "review_date" DATE,
  "official_url" TEXT,
  "stored_file_ref" TEXT,
  "language" TEXT NOT NULL DEFAULT 'en',
  "checksum" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK ("status" IN ('CANDIDATE','CURRENT','SUPERSEDED','ARCHIVED')),
  "supersedes_version_id" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_by_id" TEXT,
  "verified_at" TIMESTAMPTZ,
  "verification_note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "knowledge_source_versions_source_fk" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE RESTRICT,
  CONSTRAINT "knowledge_source_versions_supersedes_fk" FOREIGN KEY ("supersedes_version_id") REFERENCES "knowledge_source_versions"("id") ON DELETE RESTRICT,
  CONSTRAINT "knowledge_source_versions_created_by_fk" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "knowledge_source_versions_verified_by_fk" FOREIGN KEY ("verified_by_id") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "knowledge_source_version_self_supersession" CHECK ("supersedes_version_id" IS NULL OR "supersedes_version_id" <> "id"),
  CONSTRAINT "knowledge_source_versions_unique_label" UNIQUE ("source_id", "version_label")
);

CREATE UNIQUE INDEX "knowledge_source_versions_one_current_idx"
  ON "knowledge_source_versions" ("source_id")
  WHERE "status" = 'CURRENT';
CREATE INDEX "knowledge_source_versions_source_status_idx"
  ON "knowledge_source_versions" ("source_id", "status", "created_at" DESC);

CREATE TABLE "knowledge_source_audit_events" (
  "id" TEXT PRIMARY KEY,
  "source_id" TEXT NOT NULL,
  "version_id" TEXT,
  "action" TEXT NOT NULL CHECK ("action" IN (
    'SOURCE_CREATED','VERSION_CREATED','VERSION_VERIFIED','VERSION_SUPERSEDED',
    'VERSION_ARCHIVED','SOURCE_ARCHIVED','ACCESS_CLASSIFICATION_CHANGED'
  )),
  "actor_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "context" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_source_audit_source_fk" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE RESTRICT,
  CONSTRAINT "knowledge_source_audit_version_fk" FOREIGN KEY ("version_id") REFERENCES "knowledge_source_versions"("id") ON DELETE RESTRICT,
  CONSTRAINT "knowledge_source_audit_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "knowledge_source_audit_source_created_idx"
  ON "knowledge_source_audit_events" ("source_id", "created_at" DESC);

-- Once a version has left CANDIDATE state, its substantive provenance is immutable.
-- Lifecycle-only status transitions remain possible so CURRENT can become SUPERSEDED/ARCHIVED.
CREATE OR REPLACE FUNCTION prevent_verified_knowledge_source_version_rewrite()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'CANDIDATE' THEN
    IF NEW.source_id IS DISTINCT FROM OLD.source_id
      OR NEW.version_label IS DISTINCT FROM OLD.version_label
      OR NEW.publication_date IS DISTINCT FROM OLD.publication_date
      OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
      OR NEW.review_date IS DISTINCT FROM OLD.review_date
      OR NEW.official_url IS DISTINCT FROM OLD.official_url
      OR NEW.stored_file_ref IS DISTINCT FROM OLD.stored_file_ref
      OR NEW.language IS DISTINCT FROM OLD.language
      OR NEW.checksum IS DISTINCT FROM OLD.checksum
      OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
      OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.verified_by_id IS DISTINCT FROM OLD.verified_by_id
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
      OR NEW.verification_note IS DISTINCT FROM OLD.verification_note
    THEN
      RAISE EXCEPTION 'verified knowledge source versions are immutable; create a new version instead';
    END IF;
  END IF;

  IF OLD.status = 'SUPERSEDED' AND NEW.status <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'superseded knowledge source versions cannot be reactivated';
  END IF;
  IF OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED' THEN
    RAISE EXCEPTION 'archived knowledge source versions cannot be reactivated';
  END IF;
  IF OLD.status = 'CURRENT' AND NEW.status NOT IN ('CURRENT','SUPERSEDED','ARCHIVED') THEN
    RAISE EXCEPTION 'current knowledge source versions may only remain current, be superseded, or be archived';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "knowledge_source_version_immutability"
BEFORE UPDATE ON "knowledge_source_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_verified_knowledge_source_version_rewrite();

CREATE OR REPLACE FUNCTION prevent_knowledge_source_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'knowledge source audit history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "knowledge_source_audit_no_update"
BEFORE UPDATE ON "knowledge_source_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_knowledge_source_audit_mutation();

CREATE TRIGGER "knowledge_source_audit_no_delete"
BEFORE DELETE ON "knowledge_source_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_knowledge_source_audit_mutation();
