-- #1371 Phase 3B: private, append-only question-grade drafts; no result release.
BEGIN;
CREATE UNIQUE INDEX "ExamAssignment_exact_revision_key" ON exam_variant."ExamPaperAssignment"(id,revision,"variantId","variantHash");

CREATE TABLE exam_variant."ExamGradeRevision" (
  "assignmentId" text NOT NULL,
  "assignmentRevision" integer NOT NULL CHECK ("assignmentRevision">0),
  "variantId" text NOT NULL,
  "variantHash" text NOT NULL,
  revision integer NOT NULL CHECK (revision>0),
  marks jsonb NOT NULL CHECK (jsonb_typeof(marks)='array'),
  complete boolean NOT NULL,
  "earnedPoints" double precision,
  "maximumPoints" double precision NOT NULL CHECK ("maximumPoints">0 AND "maximumPoints"<'Infinity'::double precision),
  "actorId" text NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "savedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY ("assignmentId",revision),
  FOREIGN KEY ("assignmentId","assignmentRevision","variantId","variantHash")
    REFERENCES exam_variant."ExamPaperAssignment"(id,revision,"variantId","variantHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ((complete AND "earnedPoints" IS NOT NULL AND "earnedPoints">=0 AND "earnedPoints"<'Infinity'::double precision
    AND "earnedPoints"-"maximumPoints"<=greatest(abs("earnedPoints"),abs("maximumPoints"))*1e-12)
    OR (NOT complete AND "earnedPoints" IS NULL))
);
CREATE FUNCTION exam_variant.validate_grade_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a record; p record; q jsonb; m jsonb; idx integer:=0; points double precision; maximum double precision;
  total double precision:=0; all_marked boolean:=true; prior integer;
BEGIN
  SELECT * INTO STRICT a FROM exam_variant."ExamPaperAssignment" WHERE id=NEW."assignmentId" FOR UPDATE;
  IF (a.revision,a."variantId",a."variantHash") IS DISTINCT FROM (NEW."assignmentRevision",NEW."variantId",NEW."variantHash")
    THEN RAISE EXCEPTION 'Grade requires exact confirmed assignment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM exam_variant."ExamGradingFence" f WHERE f."courseSpecId"=a."courseSpecId" AND f."assessmentItemId"=a."assessmentItemId" AND f.mode='variant')
    THEN RAISE EXCEPTION 'Variant grading mode required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Offering" o JOIN public."Enrollment" e ON e."offeringId"=o.id JOIN public."Student" s ON s.id=e."studentId"
    WHERE o.id=a."offeringId" AND e.id=a."enrollmentId" AND o.status='Active' AND s.status='Active' AND s."studentId" IS NOT NULL)
    THEN RAISE EXCEPTION 'Active offering and eligible student required'; END IF;
  SELECT v.questions,c."examMaximum" INTO STRICT p FROM exam_variant."ExamPaperVersion" v JOIN exam_variant."ExamConfiguration" c USING ("courseSpecId","assessmentItemId")
    WHERE v."courseSpecId"=a."courseSpecId" AND v."assessmentItemId"=a."assessmentItemId" AND v."variantId"=a."variantId" AND v."variantHash"=a."variantHash";
  SELECT COALESCE(max(revision),0) INTO prior FROM exam_variant."ExamGradeRevision" WHERE "assignmentId"=a.id;
  IF NEW.revision<>prior+1 THEN RAISE EXCEPTION 'Stale grade revision'; END IF;
  IF jsonb_typeof(NEW.marks) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.marks)<>jsonb_array_length(p.questions)
    THEN RAISE EXCEPTION 'Grade must include exact question rows'; END IF;
  FOR q IN SELECT value FROM jsonb_array_elements(p.questions) LOOP
    m:=NEW.marks->idx; maximum:=(q->>'maxPoints')::double precision;
    IF jsonb_typeof(m) IS DISTINCT FROM 'object' OR (m-ARRAY['questionId','maxPoints','score'])<>'{}'::jsonb
      OR jsonb_typeof(m->'questionId') IS DISTINCT FROM 'string' OR m->>'questionId' IS DISTINCT FROM q->>'questionId'
      OR jsonb_typeof(m->'maxPoints') IS DISTINCT FROM 'number' OR (m->>'maxPoints')::double precision IS DISTINCT FROM maximum
      OR NOT (m ? 'score') THEN RAISE EXCEPTION 'Grade question metadata mismatch'; END IF;
    IF jsonb_typeof(m->'score')='null' THEN all_marked:=false;
    ELSIF jsonb_typeof(m->'score')='number' THEN
      points:=(m->>'score')::double precision;
      IF NOT (points>=0 AND points<=maximum) THEN RAISE EXCEPTION 'Question score out of range'; END IF;
      total:=total+points;
    ELSE RAISE EXCEPTION 'Invalid question score'; END IF;
    idx:=idx+1;
  END LOOP;
  -- Calculate authoritative totals; reject inconsistent supplied totals.
  IF NEW.complete IS DISTINCT FROM all_marked OR NEW."maximumPoints" IS DISTINCT FROM p."examMaximum"
    OR (NOT all_marked AND NEW."earnedPoints" IS NOT NULL)
    OR (all_marked AND (NEW."earnedPoints" IS NULL OR NOT (abs(NEW."earnedPoints"-total)<=greatest(abs(NEW."earnedPoints"),abs(total))*1e-12)))
    THEN RAISE EXCEPTION 'Grade total or completeness mismatch'; END IF;
  NEW."earnedPoints":=CASE WHEN all_marked THEN total ELSE NULL END;
  NEW."savedAt":=clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_grade_revision BEFORE INSERT ON exam_variant."ExamGradeRevision"
FOR EACH ROW EXECUTE FUNCTION exam_variant.validate_grade_revision();
CREATE TRIGGER immutable_grade_revision BEFORE UPDATE OR DELETE ON exam_variant."ExamGradeRevision"
FOR EACH ROW EXECUTE FUNCTION exam_variant.reject_change();
CREATE TRIGGER immutable_grade_truncate BEFORE TRUNCATE ON exam_variant."ExamGradeRevision"
FOR EACH STATEMENT EXECUTE FUNCTION exam_variant.reject_change();
ALTER TABLE exam_variant."ExamGradeRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON exam_variant."ExamGradeRevision" FROM PUBLIC;
REVOKE ALL ON FUNCTION exam_variant.validate_grade_revision() FROM PUBLIC;
DO $protect$
DECLARE role_name text;
BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
   EXECUTE format('REVOKE ALL ON exam_variant."ExamGradeRevision" FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON FUNCTION exam_variant.validate_grade_revision() FROM %I',role_name);
 END LOOP;
END;
$protect$;
COMMIT;
