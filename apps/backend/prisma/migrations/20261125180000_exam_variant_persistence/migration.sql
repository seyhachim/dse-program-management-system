-- #1371 Phase 2A: empty private persistence; never backfill or activate grading.
-- Parent unique keys are additive and already unique by their primary IDs.
BEGIN;
CREATE UNIQUE INDEX "Course_id_programmeId_key" ON public."Course" ("id","programmeId");
CREATE UNIQUE INDEX "CourseSpec_id_courseId_key" ON public."CourseSpec" ("id","courseId");
CREATE UNIQUE INDEX "Offering_id_courseSpecId_courseId_key" ON public."Offering" ("id","courseSpecId","courseId");
CREATE UNIQUE INDEX "Enrollment_id_offeringId_key" ON public."Enrollment" ("id","offeringId");

CREATE SCHEMA exam_variant;
REVOKE ALL ON SCHEMA exam_variant FROM PUBLIC;

CREATE TABLE exam_variant."ExamConfiguration" (
  "courseSpecId" text NOT NULL,
  "assessmentItemId" text NOT NULL,
  "courseId" text NOT NULL,
  "programmeId" text NOT NULL,
  "examMaximum" double precision NOT NULL CHECK ("examMaximum" > 0 AND "examMaximum" < 'Infinity'::double precision),
  "createdById" text NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("courseSpecId","assessmentItemId"),
  UNIQUE ("courseSpecId","assessmentItemId","courseId","programmeId"),
  FOREIGN KEY ("courseSpecId","assessmentItemId") REFERENCES public."CourseSpecAssessmentItem"("courseSpecId","id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("courseSpecId","courseId") REFERENCES public."CourseSpec"("id","courseId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("courseId","programmeId") REFERENCES public."Course"("id","programmeId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Store ordered questions atomically in the immutable snapshot (no mutable child rows
-- or ability to append questions after approval). No question text or answers.
CREATE TABLE exam_variant."ExamPaperVersion" (
  "courseSpecId" text NOT NULL,
  "assessmentItemId" text NOT NULL,
  "variantId" text NOT NULL CHECK (length("variantId") BETWEEN 1 AND 256 AND btrim("variantId") = "variantId"),
  "revision" integer NOT NULL CHECK ("revision" > 0),
  "variantHash" text NOT NULL CHECK ("variantHash" ~ '^exam-variant-v1:[0-9a-f]{64}$'),
  "instrumentId" text NOT NULL REFERENCES public."Rubric"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "instrumentHash" text NOT NULL CHECK ("instrumentHash" ~ '^marking-scheme-v1:[0-9a-f]{64}$'),
  "questions" jsonb NOT NULL CHECK (jsonb_typeof("questions") = 'array'),
  "preparedById" text NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "approvedById" text NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "moderationRef" text NOT NULL CHECK (length(btrim("moderationRef")) BETWEEN 1 AND 256),
  "approvedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("preparedById" <> "approvedById"),
  PRIMARY KEY ("courseSpecId","assessmentItemId","variantId","revision"),
  UNIQUE ("courseSpecId","assessmentItemId","variantId","variantHash"),
  FOREIGN KEY ("courseSpecId","assessmentItemId") REFERENCES exam_variant."ExamConfiguration"("courseSpecId","assessmentItemId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE exam_variant."ExamOfferingPermission" (
  "courseSpecId" text NOT NULL,
  "assessmentItemId" text NOT NULL,
  "courseId" text NOT NULL,
  "programmeId" text NOT NULL,
  "offeringId" text NOT NULL,
  "variantId" text NOT NULL,
  "variantHash" text NOT NULL,
  "createdById" text NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("offeringId","courseSpecId","assessmentItemId","variantId","variantHash"),
  FOREIGN KEY ("courseSpecId","assessmentItemId","courseId","programmeId") REFERENCES exam_variant."ExamConfiguration"("courseSpecId","assessmentItemId","courseId","programmeId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("offeringId","courseSpecId","courseId") REFERENCES public."Offering"("id","courseSpecId","courseId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("courseSpecId","assessmentItemId","variantId","variantHash") REFERENCES exam_variant."ExamPaperVersion"("courseSpecId","assessmentItemId","variantId","variantHash") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE exam_variant."ExamPaperAssignment" (
  "id" text PRIMARY KEY,
  "enrollmentId" text NOT NULL,
  "offeringId" text NOT NULL,
  "courseSpecId" text NOT NULL,
  "assessmentItemId" text NOT NULL,
  "variantId" text NOT NULL,
  "variantHash" text NOT NULL,
  "revision" integer NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "actorId" text NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "reason" text NOT NULL CHECK (length(btrim("reason")) BETWEEN 1 AND 500),
  "evidenceRef" text NOT NULL CHECK (length(btrim("evidenceRef")) BETWEEN 1 AND 256),
  "changedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("enrollmentId","courseSpecId","assessmentItemId"),
  UNIQUE ("id","offeringId","courseSpecId","assessmentItemId"),
  FOREIGN KEY ("enrollmentId","offeringId") REFERENCES public."Enrollment"("id","offeringId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("offeringId","courseSpecId","assessmentItemId","variantId","variantHash") REFERENCES exam_variant."ExamOfferingPermission"("offeringId","courseSpecId","assessmentItemId","variantId","variantHash") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE exam_variant."ExamAssignmentEvent" (
  "assignmentId" text NOT NULL,
  "revision" integer NOT NULL CHECK ("revision" > 0),
  "offeringId" text NOT NULL,
  "courseSpecId" text NOT NULL,
  "assessmentItemId" text NOT NULL,
  "previousVariantId" text,
  "previousVariantHash" text,
  "variantId" text NOT NULL,
  "variantHash" text NOT NULL,
  "actorId" text NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "reason" text NOT NULL CHECK (length(btrim("reason")) BETWEEN 1 AND 500),
  "evidenceRef" text NOT NULL CHECK (length(btrim("evidenceRef")) BETWEEN 1 AND 256),
  "changedAt" timestamptz NOT NULL,
  PRIMARY KEY ("assignmentId","revision"),
  CHECK (("revision" = 1 AND "previousVariantId" IS NULL AND "previousVariantHash" IS NULL)
      OR ("revision" > 1 AND "previousVariantId" IS NOT NULL AND "previousVariantHash" IS NOT NULL)),
  FOREIGN KEY ("assignmentId","offeringId","courseSpecId","assessmentItemId") REFERENCES exam_variant."ExamPaperAssignment"("id","offeringId","courseSpecId","assessmentItemId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("offeringId","courseSpecId","assessmentItemId","variantId","variantHash") REFERENCES exam_variant."ExamOfferingPermission"("offeringId","courseSpecId","assessmentItemId","variantId","variantHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("offeringId","courseSpecId","assessmentItemId","previousVariantId","previousVariantHash") REFERENCES exam_variant."ExamOfferingPermission"("offeringId","courseSpecId","assessmentItemId","variantId","variantHash") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "ExamAssignment_offering_assessment_idx" ON exam_variant."ExamPaperAssignment"("offeringId","courseSpecId","assessmentItemId");
CREATE INDEX "ExamPermission_version_idx" ON exam_variant."ExamOfferingPermission"("courseSpecId","assessmentItemId","variantId","variantHash");

CREATE FUNCTION exam_variant.reject_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Exam variant history is immutable'; END;
$$;

CREATE FUNCTION exam_variant.validate_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."CourseSpec" s JOIN public."CourseSpecAssessmentItem" a ON a."courseSpecId"=s.id
    WHERE s.id=NEW."courseSpecId" AND s."courseId"=NEW."courseId" AND s."reviewStatus"='Approved'
      AND a.id=NEW."assessmentItemId" AND a.status='Active' AND a.mode='Individual'
      AND a."rubricId" IS NULL AND a.weight > 0 AND a.weight <= 100
  ) THEN RAISE EXCEPTION 'Exam configuration requires approved active individual assessment without legacy instrument'; END IF;
  -- Do not retrofit legacy results in Phase 2A.
  IF EXISTS (SELECT 1 FROM public."AssessmentResult" r WHERE r."courseSpecId"=NEW."courseSpecId" AND r."assessmentItemId"=NEW."assessmentItemId") THEN
    RAISE EXCEPTION 'Existing assessment results require historical reconciliation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_exam_configuration BEFORE INSERT ON exam_variant."ExamConfiguration"
FOR EACH ROW EXECUTE FUNCTION exam_variant.validate_configuration();

CREATE FUNCTION exam_variant.validate_paper() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE maximum double precision; q jsonb; n integer := 0; summed double precision := 0; points double precision; expected_count integer;
BEGIN
  SELECT c."examMaximum" INTO STRICT maximum FROM exam_variant."ExamConfiguration" c
    WHERE c."courseSpecId"=NEW."courseSpecId" AND c."assessmentItemId"=NEW."assessmentItemId";
  IF NOT EXISTS (SELECT 1 FROM public."Rubric" r WHERE r.id=NEW."instrumentId" AND r."instrumentKind"='marking_scheme' AND r.status='Active') THEN
    RAISE EXCEPTION 'Paper requires active marking scheme';
  END IF;
  IF jsonb_typeof(NEW.questions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid questions'; END IF;
  SELECT count(*) INTO expected_count FROM public."RubricCriterion" WHERE "rubricId"=NEW."instrumentId";
  IF jsonb_array_length(NEW.questions) NOT BETWEEN 1 AND 1000 OR jsonb_array_length(NEW.questions) <> expected_count THEN
    RAISE EXCEPTION 'Paper question count mismatch';
  END IF;
  IF (SELECT count(DISTINCT value->>'questionId') FROM jsonb_array_elements(NEW.questions)) <> expected_count THEN
    RAISE EXCEPTION 'Duplicate or missing question identity';
  END IF;
  FOR q IN SELECT value FROM jsonb_array_elements(NEW.questions) LOOP
    IF jsonb_typeof(q) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid question'; END IF;
    IF (q - ARRAY['questionId','maxPoints','cloCode','evidence']) <> '{}'::jsonb
       OR jsonb_typeof(q->'questionId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(q->'cloCode') IS DISTINCT FROM 'string'
       OR jsonb_typeof(q->'maxPoints') IS DISTINCT FROM 'number'
       OR jsonb_typeof(q->'evidence') IS DISTINCT FROM 'string'
       OR q->>'evidence' NOT IN ('direct','supporting') THEN RAISE EXCEPTION 'Invalid question metadata'; END IF;
    points := (q->>'maxPoints')::double precision;
    IF NOT (points > 0 AND points < 'Infinity'::double precision) THEN RAISE EXCEPTION 'Invalid question maximum'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."RubricCriterion" rc
      WHERE rc."rubricId"=NEW."instrumentId" AND rc.id=q->>'questionId' AND rc."maxPoints"=points
        AND rc.id=(SELECT id FROM public."RubricCriterion" WHERE "rubricId"=NEW."instrumentId" ORDER BY "order",id OFFSET n LIMIT 1)
    ) THEN RAISE EXCEPTION 'Question differs from instrument'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."CourseSpecClo" c JOIN public."CourseSpecAssessmentItem" a ON a."courseSpecId"=c."courseSpecId"
      WHERE c."courseSpecId"=NEW."courseSpecId" AND c.status='Active' AND a.id=NEW."assessmentItemId"
        AND q->>'cloCode'='CLO'||(c."order"+1)::text AND q->>'cloCode'=ANY(a."cloCodes")
    ) THEN RAISE EXCEPTION 'Question requires active assessment CLO'; END IF;
    summed := summed + points; n := n + 1;
  END LOOP;
  IF NOT (summed < 'Infinity'::double precision) OR abs(summed-maximum) > greatest(abs(summed),abs(maximum))*1e-12 THEN
    RAISE EXCEPTION 'Paper maximum mismatch';
  END IF;
  -- Hash format is checked here; trusted service must recompute both hashes using
  -- Phase 1 and rubricContentHash. SQL does not authenticate approval or actor.
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_exam_paper BEFORE INSERT ON exam_variant."ExamPaperVersion"
FOR EACH ROW EXECUTE FUNCTION exam_variant.validate_paper();

CREATE FUNCTION exam_variant.guard_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Exam assignment history cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 THEN RAISE EXCEPTION 'Initial assignment revision must be one'; END IF;
  ELSE
    IF (NEW.id,NEW."enrollmentId",NEW."offeringId",NEW."courseSpecId",NEW."assessmentItemId")
       IS DISTINCT FROM (OLD.id,OLD."enrollmentId",OLD."offeringId",OLD."courseSpecId",OLD."assessmentItemId")
       OR NEW.revision<>OLD.revision+1 OR (NEW."variantId",NEW."variantHash") IS NOT DISTINCT FROM (OLD."variantId",OLD."variantHash")
    THEN RAISE EXCEPTION 'Assignment scope, revision or variant change invalid'; END IF;
  END IF;
  PERFORM id FROM public."Offering" WHERE id=NEW."offeringId" FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public."AssessmentResult" r WHERE r."enrollmentId"=NEW."enrollmentId" AND r."courseSpecId"=NEW."courseSpecId" AND r."assessmentItemId"=NEW."assessmentItemId") THEN
    RAISE EXCEPTION 'Existing result blocks assignment or reassignment';
  END IF;
  NEW."changedAt" := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_exam_assignment BEFORE INSERT OR UPDATE OR DELETE ON exam_variant."ExamPaperAssignment"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_assignment();

CREATE FUNCTION exam_variant.guard_event_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN RAISE EXCEPTION 'Assignment events are generated by assignment changes only'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER exam_event_generated_only BEFORE INSERT ON exam_variant."ExamAssignmentEvent"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_event_insert();

CREATE FUNCTION exam_variant.record_assignment_event() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO exam_variant."ExamAssignmentEvent" ("assignmentId","revision","offeringId","courseSpecId","assessmentItemId","previousVariantId","previousVariantHash","variantId","variantHash","actorId","reason","evidenceRef","changedAt")
  VALUES (NEW.id,NEW.revision,NEW."offeringId",NEW."courseSpecId",NEW."assessmentItemId",
    CASE WHEN TG_OP='UPDATE' THEN OLD."variantId" END, CASE WHEN TG_OP='UPDATE' THEN OLD."variantHash" END,
    NEW."variantId",NEW."variantHash",NEW."actorId",NEW.reason,NEW."evidenceRef",NEW."changedAt");
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_exam_assignment AFTER INSERT OR UPDATE ON exam_variant."ExamPaperAssignment"
FOR EACH ROW EXECUTE FUNCTION exam_variant.record_assignment_event();

DO $protect$
DECLARE t text; role_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ExamConfiguration','ExamPaperVersion','ExamOfferingPermission','ExamAssignmentEvent'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_exam_row BEFORE UPDATE OR DELETE ON exam_variant.%I FOR EACH ROW EXECUTE FUNCTION exam_variant.reject_change()',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ExamConfiguration','ExamPaperVersion','ExamOfferingPermission','ExamPaperAssignment','ExamAssignmentEvent'] LOOP
    EXECUTE format('ALTER TABLE exam_variant.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE TRIGGER immutable_exam_truncate BEFORE TRUNCATE ON exam_variant.%I FOR EACH STATEMENT EXECUTE FUNCTION exam_variant.reject_change()',t);
  END LOOP;
  REVOKE ALL ON ALL TABLES IN SCHEMA exam_variant FROM PUBLIC;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA exam_variant FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA exam_variant REVOKE ALL ON TABLES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA exam_variant REVOKE ALL ON FUNCTIONS FROM PUBLIC;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA exam_variant FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA exam_variant FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA exam_variant FROM %I',role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA exam_variant REVOKE ALL ON TABLES FROM %I',role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA exam_variant REVOKE ALL ON FUNCTIONS FROM %I',role_name);
  END LOOP;
END;
$protect$;
COMMIT;
