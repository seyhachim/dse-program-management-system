-- Additive to the previous draft migration; existing reference-only rows remain valid.
ALTER TABLE "AssessmentEvidenceRevision" ADD COLUMN "attachment" JSONB;
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid = '"AssessmentEvidenceRevision"'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%"workReference" IS NOT NULL%'
    AND pg_get_constraintdef(oid) LIKE '%draft%';
  EXECUTE format('ALTER TABLE "AssessmentEvidenceRevision" DROP CONSTRAINT %I', constraint_name);
END $$;
ALTER TABLE "AssessmentEvidenceRevision"
  ADD CONSTRAINT "AssessmentEvidenceRevision_work_check" CHECK (
    (status = 'draft' OR "workReference" IS NOT NULL OR attachment IS NOT NULL)
    AND NOT ("workReference" IS NOT NULL AND attachment IS NOT NULL)
    AND (attachment IS NULL OR (
      jsonb_typeof(attachment) = 'object'
      AND attachment ?& ARRAY['objectKey','filename','mimeType','sizeBytes','sha256']
      AND attachment->>'objectKey' ~ '^v1/[0-9a-f-]{36}\.(pdf|jpg|png)$'
      AND attachment->>'sha256' ~ '^[0-9a-f]{64}$'
      AND attachment->>'mimeType' IN ('application/pdf','image/jpeg','image/png')
      AND jsonb_typeof(attachment->'sizeBytes') = 'number'
      AND (attachment->>'sizeBytes')::numeric BETWEEN 8 AND 5242880
      AND length(attachment->>'filename') BETWEEN 1 AND 180
    ) IS TRUE)
  );
CREATE FUNCTION "validate_assessment_evidence_attachment"() RETURNS trigger AS $$
DECLARE previous_attachment jsonb;
BEGIN
  IF NEW.action NOT IN ('create','revise') THEN
    SELECT attachment INTO previous_attachment FROM "AssessmentEvidenceRevision"
      WHERE "resultId" = NEW."resultId" ORDER BY revision DESC LIMIT 1;
    IF NEW.attachment IS DISTINCT FROM previous_attachment THEN
      RAISE EXCEPTION 'Only draft revisions may change evidence attachments';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentEvidenceRevision_attachment_validate" BEFORE INSERT ON "AssessmentEvidenceRevision"
FOR EACH ROW EXECUTE FUNCTION "validate_assessment_evidence_attachment"();
