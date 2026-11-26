-- #1371 Phase 3B.1: private academic blueprint and marking quality evidence.
-- No marks are rewritten; old draft revisions remain readable without a dossier.
BEGIN;
CREATE TABLE exam_variant."ExamAcademicDossier" (
  id text PRIMARY KEY,
  "offeringId" text NOT NULL,
  "courseSpecId" text NOT NULL,
  "assessmentItemId" text NOT NULL,
  "variantId" text NOT NULL,
  "variantHash" text NOT NULL,
  blueprint jsonb NOT NULL CHECK (jsonb_typeof(blueprint)='object'),
  "baselineId" text,
  "submittedById" text NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "submittedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Returned')),
  "decidedById" text REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "decidedAt" timestamptz,
  review jsonb,
  UNIQUE(id,"courseSpecId","assessmentItemId"),
  UNIQUE(id,"courseSpecId","assessmentItemId","variantId","variantHash"),
  FOREIGN KEY ("offeringId","courseSpecId","assessmentItemId","variantId","variantHash")
    REFERENCES exam_variant."ExamOfferingPermission"("offeringId","courseSpecId","assessmentItemId","variantId","variantHash") ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY ("baselineId","courseSpecId","assessmentItemId")
    REFERENCES exam_variant."ExamAcademicDossier"(id,"courseSpecId","assessmentItemId") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK ("baselineId" IS NULL OR "baselineId"<>id),
  CHECK ((status='Pending' AND "decidedById" IS NULL AND "decidedAt" IS NULL AND review IS NULL)
    OR (status IN ('Approved','Returned') AND "decidedById" IS NOT NULL AND "decidedById"<>"submittedById"
      AND "decidedAt" IS NOT NULL AND review IS NOT NULL AND jsonb_typeof(review)='object'))
);
CREATE UNIQUE INDEX "ExamAcademicDossier_open_version_key" ON exam_variant."ExamAcademicDossier"("courseSpecId","assessmentItemId","variantId","variantHash") WHERE status IN ('Pending','Approved');
CREATE UNIQUE INDEX "ExamAcademicDossier_baseline_key" ON exam_variant."ExamAcademicDossier"("courseSpecId","assessmentItemId") WHERE status='Approved' AND "baselineId" IS NULL;
CREATE INDEX "ExamAcademicDossier_scope_idx" ON exam_variant."ExamAcademicDossier"("courseSpecId","assessmentItemId","variantHash");

CREATE FUNCTION exam_variant.guard_academic_dossier() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p record; q jsonb; m jsonb; idx integer:=0; field text; baseline text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Academic dossier history is immutable'; END IF;
  SELECT questions,"preparedById" INTO STRICT p FROM exam_variant."ExamPaperVersion" v
    WHERE v."courseSpecId"=NEW."courseSpecId" AND v."assessmentItemId"=NEW."assessmentItemId" AND v."variantId"=NEW."variantId" AND v."variantHash"=NEW."variantHash";
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'Pending' THEN RAISE EXCEPTION 'Academic dossier must begin pending'; END IF;
    IF (NEW.blueprint-ARRAY['durationMinutes','conditions','restrictedSchemeRef','components'])<>'{}'::jsonb
      OR jsonb_typeof(NEW.blueprint->'durationMinutes') IS DISTINCT FROM 'number'
      OR (NEW.blueprint->>'durationMinutes') !~ '^[0-9]+$'
      OR (NEW.blueprint->>'durationMinutes')::integer NOT BETWEEN 1 AND 720
      OR jsonb_typeof(NEW.blueprint->'conditions') IS DISTINCT FROM 'string'
      OR length(btrim(NEW.blueprint->>'conditions')) NOT BETWEEN 3 AND 1000
      OR jsonb_typeof(NEW.blueprint->'restrictedSchemeRef') IS DISTINCT FROM 'string'
      OR (NEW.blueprint->>'restrictedSchemeRef') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
      OR jsonb_typeof(NEW.blueprint->'components') IS DISTINCT FROM 'array'
      OR jsonb_array_length(NEW.blueprint->'components')<>jsonb_array_length(p.questions)
      THEN RAISE EXCEPTION 'Invalid academic blueprint'; END IF;
    FOR q IN SELECT value FROM jsonb_array_elements(p.questions) LOOP
      m:=NEW.blueprint->'components'->idx;
      IF jsonb_typeof(m) IS DISTINCT FROM 'object'
        OR (m-ARRAY['questionId','maxPoints','cloCode','evidence','parentLabel','componentLabel','topic','bloom','expectedAnswerRef','partialCredit'])<>'{}'::jsonb
        OR m->'questionId' IS DISTINCT FROM q->'questionId' OR m->'maxPoints' IS DISTINCT FROM q->'maxPoints'
        OR m->'cloCode' IS DISTINCT FROM q->'cloCode' OR m->'evidence' IS DISTINCT FROM q->'evidence'
        OR jsonb_typeof(m->'bloom') IS DISTINCT FROM 'string'
        OR m->>'bloom' NOT IN ('Remember','Understand','Apply','Analyze','Evaluate','Create')
        OR jsonb_typeof(m->'expectedAnswerRef') IS DISTINCT FROM 'string'
        OR m->>'expectedAnswerRef' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
        OR jsonb_typeof(m->'partialCredit') IS DISTINCT FROM 'string'
        OR length(btrim(m->>'partialCredit')) NOT BETWEEN 3 AND 2000
      THEN RAISE EXCEPTION 'Academic blueprint differs from exact paper'; END IF;
      FOREACH field IN ARRAY ARRAY['parentLabel','componentLabel','topic'] LOOP
        IF jsonb_typeof(m->field) IS DISTINCT FROM 'string' OR length(btrim(m->>field)) NOT BETWEEN 1 AND 80
          THEN RAISE EXCEPTION 'Invalid blueprint label'; END IF;
      END LOOP;
      idx:=idx+1;
    END LOOP;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.blueprint->'components') AS c(value)
      GROUP BY lower(btrim(c.value->>'parentLabel')),lower(btrim(c.value->>'componentLabel')) HAVING count(*)>1)
      THEN RAISE EXCEPTION 'Duplicate component label within parent'; END IF;
  ELSE
    IF OLD.status<>'Pending' OR NEW.status NOT IN ('Approved','Returned')
      OR (to_jsonb(NEW)-ARRAY['status','decidedById','decidedAt','review']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decidedById','decidedAt','review'])
      THEN RAISE EXCEPTION 'Academic dossier history is immutable'; END IF;
    IF NEW."decidedById" IS NOT DISTINCT FROM p."preparedById" THEN RAISE EXCEPTION 'Independent academic reviewer required'; END IF;
    IF NEW.status='Approved' THEN
      FOREACH field IN ARRAY ARRAY['coverage','cognitiveDemand','difficulty','workload','scoringRules','fairness'] LOOP
        IF NEW.review->field IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'All academic moderation checks must be explicitly accepted'; END IF;
      END LOOP;
      IF (NEW.review-ARRAY['coverage','cognitiveDemand','difficulty','workload','scoringRules','fairness','rationale'])<>'{}'::jsonb
        OR jsonb_typeof(NEW.review->'rationale') IS DISTINCT FROM 'string'
        OR length(btrim(NEW.review->>'rationale')) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Academic review rationale required'; END IF;
    ELSE
      IF (NEW.review-'rationale')<>'{}'::jsonb OR jsonb_typeof(NEW.review->'rationale') IS DISTINCT FROM 'string'
        OR length(btrim(NEW.review->>'rationale')) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Return rationale required'; END IF;
    END IF;
    NEW."decidedAt":=clock_timestamp();
  END IF;
  IF TG_OP='INSERT' OR NEW.status='Approved' THEN
    SELECT id INTO baseline FROM exam_variant."ExamAcademicDossier"
      WHERE "courseSpecId"=NEW."courseSpecId" AND "assessmentItemId"=NEW."assessmentItemId" AND status='Approved' AND "baselineId" IS NULL;
    IF NEW."baselineId" IS DISTINCT FROM baseline THEN RAISE EXCEPTION 'Academic comparison must use the approved baseline'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_academic_dossier BEFORE INSERT OR UPDATE OR DELETE ON exam_variant."ExamAcademicDossier"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_academic_dossier();
CREATE TRIGGER immutable_academic_dossier_truncate BEFORE TRUNCATE ON exam_variant."ExamAcademicDossier"
FOR EACH STATEMENT EXECUTE FUNCTION exam_variant.reject_change();

-- Existing grade revisions remain immutable, with NULL dossier and empty feedback.
ALTER TABLE exam_variant."ExamGradeRevision" ADD COLUMN "dossierId" text REFERENCES exam_variant."ExamAcademicDossier"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE exam_variant."ExamGradeRevision" ADD COLUMN feedback jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(feedback)='array');
CREATE FUNCTION exam_variant.guard_grade_academics() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a record; f jsonb;
BEGIN
  SELECT * INTO STRICT a FROM exam_variant."ExamPaperAssignment" WHERE id=NEW."assignmentId" FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM exam_variant."ExamAcademicDossier" d WHERE d.id=NEW."dossierId" AND d.status='Approved'
    AND d."courseSpecId"=a."courseSpecId" AND d."assessmentItemId"=a."assessmentItemId"
    AND d."variantId"=a."variantId" AND d."variantHash"=a."variantHash")
  THEN RAISE EXCEPTION 'Approved academic marking dossier required'; END IF;
  IF jsonb_typeof(NEW.feedback) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.feedback)>jsonb_array_length(NEW.marks)
    THEN RAISE EXCEPTION 'Invalid question feedback'; END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(NEW.feedback) LOOP
    IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR (f-ARRAY['questionId','comment'])<>'{}'::jsonb
      OR jsonb_typeof(f->'questionId') IS DISTINCT FROM 'string' OR jsonb_typeof(f->'comment') IS DISTINCT FROM 'string'
      OR length(btrim(f->>'comment')) NOT BETWEEN 1 AND 1000
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.marks) AS m(value) WHERE m.value->'questionId'=f->'questionId')
      THEN RAISE EXCEPTION 'Invalid question feedback'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.feedback) AS f(value) GROUP BY f.value->>'questionId' HAVING count(*)>1)
    THEN RAISE EXCEPTION 'Duplicate question feedback'; END IF;
  RETURN NEW;
END;
$$;
-- After the existing validate_grade_revision trigger, so original score checks remain authoritative.
CREATE TRIGGER zz_guard_grade_academics BEFORE INSERT ON exam_variant."ExamGradeRevision"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_grade_academics();

CREATE TABLE exam_variant."ExamSampleModeration" (
  "assignmentId" text NOT NULL,
  "gradeRevision" integer NOT NULL,
  "reviewerId" text NOT NULL REFERENCES public."User"(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('Accepted','ChangesRequired')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  "sampleRef" text NOT NULL CHECK ("sampleRef" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
  "reviewedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY("assignmentId","gradeRevision"),
  FOREIGN KEY ("assignmentId","gradeRevision") REFERENCES exam_variant."ExamGradeRevision"("assignmentId",revision) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE FUNCTION exam_variant.validate_sample_moderation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM exam_variant."ExamGradeRevision" g WHERE g."assignmentId"=NEW."assignmentId"
    AND g.revision=NEW."gradeRevision" AND g.complete AND g."dossierId" IS NOT NULL AND g."actorId"<>NEW."reviewerId")
    THEN RAISE EXCEPTION 'Complete academically moderated grade and independent marker review required'; END IF;
  NEW."reviewedAt":=clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_sample_moderation BEFORE INSERT ON exam_variant."ExamSampleModeration"
FOR EACH ROW EXECUTE FUNCTION exam_variant.validate_sample_moderation();
CREATE TRIGGER immutable_sample_moderation BEFORE UPDATE OR DELETE ON exam_variant."ExamSampleModeration"
FOR EACH ROW EXECUTE FUNCTION exam_variant.reject_change();
CREATE TRIGGER immutable_sample_truncate BEFORE TRUNCATE ON exam_variant."ExamSampleModeration"
FOR EACH STATEMENT EXECUTE FUNCTION exam_variant.reject_change();

ALTER TABLE exam_variant."ExamAcademicDossier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_variant."ExamSampleModeration" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON exam_variant."ExamAcademicDossier",exam_variant."ExamSampleModeration" FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA exam_variant FROM PUBLIC;
DO $protect$
DECLARE role_name text;
BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
   EXECUTE format('REVOKE ALL ON exam_variant."ExamAcademicDossier",exam_variant."ExamSampleModeration" FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA exam_variant FROM %I',role_name);
 END LOOP;
END;
$protect$;
COMMIT;
