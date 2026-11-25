-- #1371 Phase 2C: durable private moderation queue, no backfill or activation.
BEGIN;
CREATE TABLE exam_variant."ExamModerationSubmission" (
  id text PRIMARY KEY,
  "offeringId" text NOT NULL,
  "courseId" text NOT NULL,
  "programmeId" text NOT NULL,
  "courseSpecId" text NOT NULL,
  "assessmentItemId" text NOT NULL,
  "variantId" text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  "variantHash" text NOT NULL CHECK ("variantHash" ~ '^exam-variant-v1:[0-9a-f]{64}$'),
  "instrumentId" text NOT NULL REFERENCES public."Rubric"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  "submittedById" text NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "submittedAt" timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Returned')),
  "decidedById" text REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "decidedAt" timestamptz,
  "decisionRef" text,
  CHECK (("status"='Pending' AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionRef" IS NULL)
    OR ("status" IN ('Approved','Returned') AND "decidedById" IS NOT NULL AND "decidedById"<>"submittedById"
      AND "decidedAt" IS NOT NULL AND "decisionRef" IS NOT NULL AND length(btrim("decisionRef")) BETWEEN 1 AND 500)),
  CHECK (snapshot->>'courseSpecId' IS NOT DISTINCT FROM "courseSpecId"
    AND snapshot->>'assessmentItemId' IS NOT DISTINCT FROM "assessmentItemId"
    AND snapshot->>'programmeId' IS NOT DISTINCT FROM "programmeId"
    AND snapshot->>'variantId' IS NOT DISTINCT FROM "variantId"
    AND snapshot->>'variantHash' IS NOT DISTINCT FROM "variantHash"
    AND snapshot->>'instrumentId' IS NOT DISTINCT FROM "instrumentId"
    AND snapshot->>'revision' IS NOT DISTINCT FROM revision::text),
  FOREIGN KEY ("offeringId","courseSpecId","courseId") REFERENCES public."Offering"("id","courseSpecId","courseId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("courseId","programmeId") REFERENCES public."Course"("id","programmeId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("courseSpecId","assessmentItemId") REFERENCES public."CourseSpecAssessmentItem"("courseSpecId","id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ExamModeration_pending_revision_key" ON exam_variant."ExamModerationSubmission"("courseSpecId","assessmentItemId","variantId",revision) WHERE status='Pending';
CREATE INDEX "ExamModeration_offering_idx" ON exam_variant."ExamModerationSubmission"("offeringId","assessmentItemId","submittedAt");
CREATE FUNCTION exam_variant.guard_moderation_submission() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Moderation history is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'Pending' THEN RAISE EXCEPTION 'Moderation must begin pending'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'Pending' OR NEW.status NOT IN ('Approved','Returned') OR
    (to_jsonb(NEW)-ARRAY['status','decidedById','decidedAt','decisionRef']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','decidedById','decidedAt','decisionRef'])
    THEN RAISE EXCEPTION 'Moderation submission is immutable except for one terminal decision'; END IF;
  IF NEW.status='Approved' AND NOT EXISTS (
    SELECT 1 FROM exam_variant."ExamPaperVersion" p JOIN exam_variant."ExamOfferingPermission" g
      ON g."courseSpecId"=p."courseSpecId" AND g."assessmentItemId"=p."assessmentItemId" AND g."variantId"=p."variantId" AND g."variantHash"=p."variantHash"
    WHERE p."courseSpecId"=NEW."courseSpecId" AND p."assessmentItemId"=NEW."assessmentItemId"
      AND p."variantId"=NEW."variantId" AND p.revision=NEW.revision AND p."variantHash"=NEW."variantHash"
      AND p."preparedById"=NEW."submittedById" AND p."approvedById"=NEW."decidedById" AND p."moderationRef"=NEW."decisionRef"
      AND g."offeringId"=NEW."offeringId"
  ) THEN RAISE EXCEPTION 'Approval requires exact persisted moderated paper and offering permission'; END IF;
  NEW."decidedAt" := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_moderation BEFORE INSERT OR UPDATE OR DELETE ON exam_variant."ExamModerationSubmission"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_moderation_submission();
CREATE TRIGGER immutable_moderation_truncate BEFORE TRUNCATE ON exam_variant."ExamModerationSubmission"
FOR EACH STATEMENT EXECUTE FUNCTION exam_variant.reject_change();
ALTER TABLE exam_variant."ExamModerationSubmission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON exam_variant."ExamModerationSubmission" FROM PUBLIC;
REVOKE ALL ON FUNCTION exam_variant.guard_moderation_submission() FROM PUBLIC;
DO $protect$
DECLARE role_name text;
BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
   EXECUTE format('REVOKE ALL ON exam_variant."ExamModerationSubmission" FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON FUNCTION exam_variant.guard_moderation_submission() FROM %I',role_name);
 END LOOP;
END;
$protect$;
COMMIT;
