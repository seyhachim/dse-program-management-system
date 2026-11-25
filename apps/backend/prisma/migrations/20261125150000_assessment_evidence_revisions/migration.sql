-- #1366: append-only evidence revisions, independent of official grades.
CREATE TABLE "AssessmentEvidenceRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "resultId" TEXT NOT NULL REFERENCES "AssessmentResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "offeringId" TEXT NOT NULL REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "status" TEXT NOT NULL CHECK ("status" IN ('draft','submitted','verified','changes_requested')),
  "action" TEXT NOT NULL CHECK ("action" IN ('create','revise','submit','verify','request_changes')),
  "sourceHash" TEXT NOT NULL CHECK (length("sourceHash") = 64),
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "sourceSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("sourceSnapshot") = 'object'),
  "workReference" TEXT,
  "selectionReason" TEXT NOT NULL CHECK (length(btrim("selectionReason")) BETWEEN 1 AND 500),
  "reviewReason" TEXT,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentEvidenceRevision_item_fkey" FOREIGN KEY ("courseSpecId","assessmentItemId")
    REFERENCES "CourseSpecAssessmentItem"("courseSpecId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("maxScore" > 0 AND "maxScore" < 'Infinity'::double precision AND "score" >= 0 AND "score" <= "maxScore"),
  CHECK (("action" IN ('create','revise') AND "status" = 'draft')
    OR ("action" = 'submit' AND "status" = 'submitted')
    OR ("action" = 'verify' AND "status" = 'verified')
    OR ("action" = 'request_changes' AND "status" = 'changes_requested')),
  CHECK ("status" = 'draft' OR "workReference" IS NOT NULL),
  CHECK ("action" NOT IN ('verify','request_changes') OR length(btrim(coalesce("reviewReason",''))) BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX "AssessmentEvidenceRevision_result_revision_key" ON "AssessmentEvidenceRevision"("resultId","revision");
CREATE INDEX "AssessmentEvidenceRevision_context_idx" ON "AssessmentEvidenceRevision"("offeringId","courseSpecId","assessmentItemId");
CREATE INDEX "AssessmentEvidenceRevision_item_idx" ON "AssessmentEvidenceRevision"("courseSpecId","assessmentItemId");
CREATE INDEX "AssessmentEvidenceRevision_actorId_idx" ON "AssessmentEvidenceRevision"("actorId");

-- Verify the canonical source on every insert (never trust request context).
CREATE FUNCTION "validate_assessment_evidence_revision"() RETURNS trigger AS $$
DECLARE previous "AssessmentEvidenceRevision"%ROWTYPE;
BEGIN
  PERFORM 1 FROM "AssessmentResult" r WHERE r.id = NEW."resultId" FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM "AssessmentResult" r JOIN "Enrollment" e ON e.id = r."enrollmentId"
    JOIN "Offering" o ON o.id = e."offeringId"
    JOIN "CourseSpec" s ON s.id = o."courseSpecId" AND s."courseId" = o."courseId"
    JOIN "CourseSpecAssessmentItem" a ON a."courseSpecId" = s.id AND a.id = r."assessmentItemId"
    WHERE r.id = NEW."resultId" AND o.id = NEW."offeringId"
      AND r."courseSpecId" = NEW."courseSpecId" AND s.id = NEW."courseSpecId"
      AND a.id = NEW."assessmentItemId" AND a.mode = 'Individual' AND a.status = 'Active'
      AND s."reviewStatus" = 'Approved' AND r."publishedAt" IS NOT NULL AND r."finalizedAt" IS NOT NULL
      AND r.score = NEW.score AND r."maxScore" = NEW."maxScore"
  ) THEN RAISE EXCEPTION 'Invalid assessment evidence source'; END IF;
  SELECT * INTO previous FROM "AssessmentEvidenceRevision" WHERE "resultId" = NEW."resultId" ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NEW.revision <> 1 OR NEW.action <> 'create' THEN RAISE EXCEPTION 'Invalid initial evidence revision'; END IF;
  ELSE
    IF NEW.revision <> previous.revision + 1 OR NEW.action = 'create'
      OR NEW."offeringId" <> previous."offeringId" OR NEW."courseSpecId" <> previous."courseSpecId"
      OR NEW."assessmentItemId" <> previous."assessmentItemId"
    THEN RAISE EXCEPTION 'Invalid evidence revision sequence'; END IF;
    IF NEW.action = 'submit' AND previous.status <> 'draft' THEN RAISE EXCEPTION 'Evidence must be draft'; END IF;
    IF NEW.action IN ('verify','request_changes') AND previous.status <> 'submitted' THEN RAISE EXCEPTION 'Evidence must be submitted'; END IF;
    IF NEW.action <> 'revise' AND (NEW."sourceHash" IS DISTINCT FROM previous."sourceHash"
      OR NEW."sourceSnapshot" IS DISTINCT FROM previous."sourceSnapshot"
      OR NEW."workReference" IS DISTINCT FROM previous."workReference"
      OR NEW."selectionReason" IS DISTINCT FROM previous."selectionReason")
    THEN RAISE EXCEPTION 'Only revisions may change evidence content'; END IF;
    IF NEW.action IN ('verify','request_changes') AND EXISTS (
      SELECT 1 FROM "AssessmentEvidenceRevision" x WHERE x."resultId" = NEW."resultId"
      AND x."actorId" = NEW."actorId" AND x.action IN ('create','revise','submit')
    ) THEN RAISE EXCEPTION 'Evidence authors cannot review their own evidence'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentEvidenceRevision_validate" BEFORE INSERT ON "AssessmentEvidenceRevision"
FOR EACH ROW EXECUTE FUNCTION "validate_assessment_evidence_revision"();

CREATE FUNCTION "protect_assessment_evidence_revision"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Assessment evidence revision history is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentEvidenceRevision_immutable" BEFORE UPDATE OR DELETE ON "AssessmentEvidenceRevision"
FOR EACH ROW EXECUTE FUNCTION "protect_assessment_evidence_revision"();

ALTER TABLE "AssessmentEvidenceRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AssessmentEvidenceRevision" FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "AssessmentEvidenceRevision" FROM %I', r);
    END IF;
  END LOOP;
END $$;
