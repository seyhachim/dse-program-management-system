-- #1371 Phase 3A: mutually exclusive legacy and variant grading.
-- No changes to existing marks; variant grading is intentionally blocked until 3B.
BEGIN;

-- Serialize migration preflight with writers; fail closed on incompatible history.
LOCK TABLE public."AssessmentResult", public."AssessmentGroup", exam_variant."ExamConfiguration" IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM exam_variant."ExamConfiguration" c
    JOIN public."AssessmentResult" r USING ("courseSpecId","assessmentItemId"))
    OR EXISTS (SELECT 1 FROM exam_variant."ExamConfiguration" c
    JOIN public."AssessmentGroup" g USING ("courseSpecId","assessmentItemId"))
  THEN RAISE EXCEPTION 'Existing variant/legacy overlap requires historical reconciliation before migration'; END IF;
END;
$preflight$;

-- A durable row, not merely an advisory lock, is essential under Repeatable
-- Read/Serializable: concurrent incompatible inserts must conflict even when
-- one transaction has an earlier MVCC snapshot. No historical data backfill.
-- Deliberately no FK: legacy result scopes predate canonical item binding and
-- must not acquire a new FK requirement. Retain the fence even after deletion.
CREATE TABLE exam_variant."ExamGradingFence" (
  "courseSpecId" text NOT NULL,
  "assessmentItemId" text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('legacy','variant')),
  PRIMARY KEY ("courseSpecId","assessmentItemId")
);
ALTER TABLE exam_variant."ExamGradingFence" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION exam_variant.guard_grading_fence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Exam grading mode history is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_grading_fence BEFORE UPDATE OR DELETE ON exam_variant."ExamGradingFence"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_grading_fence();
CREATE TRIGGER immutable_grading_fence_truncate BEFORE TRUNCATE ON exam_variant."ExamGradingFence"
FOR EACH STATEMENT EXECUTE FUNCTION exam_variant.reject_change();

CREATE FUNCTION exam_variant.claim_grading_mode(spec_id text, item_id text, requested_mode text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE acquired text;
BEGIN
  INSERT INTO exam_variant."ExamGradingFence" AS f ("courseSpecId","assessmentItemId",mode)
  VALUES (spec_id,item_id,requested_mode)
  ON CONFLICT ("courseSpecId","assessmentItemId") DO UPDATE SET mode=EXCLUDED.mode
    WHERE f.mode=EXCLUDED.mode
  RETURNING mode INTO acquired;
  IF acquired IS NULL THEN
    IF requested_mode='variant' THEN RAISE EXCEPTION 'Existing legacy grading history requires historical reconciliation'; END IF;
    RAISE EXCEPTION 'Multi-variant exam requires variant-aware grading; legacy grading is disabled';
  END IF;
END;
$$;

CREATE FUNCTION exam_variant.guard_configuration_grading_mode() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM exam_variant.claim_grading_mode(NEW."courseSpecId",NEW."assessmentItemId",'variant');
  -- Existing legacy rows may predate this migration and have no fence yet.
  IF EXISTS (SELECT 1 FROM public."AssessmentResult" r WHERE r."courseSpecId"=NEW."courseSpecId" AND r."assessmentItemId"=NEW."assessmentItemId")
    OR EXISTS (SELECT 1 FROM public."AssessmentGroup" g WHERE g."courseSpecId"=NEW."courseSpecId" AND g."assessmentItemId"=NEW."assessmentItemId")
  THEN RAISE EXCEPTION 'Existing legacy grading history requires historical reconciliation'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_configuration_grading_mode BEFORE INSERT ON exam_variant."ExamConfiguration"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_configuration_grading_mode();

CREATE FUNCTION exam_variant.assert_legacy_grading_scope(spec_id text,item_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM exam_variant.claim_grading_mode(spec_id,item_id,'legacy');
  -- Also catches configurations that existed before the fence migration.
  IF EXISTS (SELECT 1 FROM exam_variant."ExamConfiguration" c WHERE c."courseSpecId"=spec_id AND c."assessmentItemId"=item_id)
  THEN RAISE EXCEPTION 'Multi-variant exam requires variant-aware grading; legacy grading is disabled'; END IF;
END;
$$;

-- Guards all ORM, raw SQL, imports, upserts, correction, publication and deletion
-- paths that touch the canonical result or the group root, regardless of UI.
-- For UPDATE also protect the old scope, so moving a row cannot bypass the guard.
CREATE FUNCTION exam_variant.guard_legacy_grading_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    PERFORM exam_variant.assert_legacy_grading_scope(OLD."courseSpecId",OLD."assessmentItemId");
  END IF;
  IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND (NEW."courseSpecId",NEW."assessmentItemId")
      IS DISTINCT FROM (OLD."courseSpecId",OLD."assessmentItemId")) THEN
    PERFORM exam_variant.assert_legacy_grading_scope(NEW."courseSpecId",NEW."assessmentItemId");
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER exam_legacy_result_guard BEFORE INSERT OR UPDATE OR DELETE ON public."AssessmentResult"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_legacy_grading_row();
CREATE TRIGGER exam_legacy_group_guard BEFORE INSERT OR UPDATE OR DELETE ON public."AssessmentGroup"
FOR EACH ROW EXECUTE FUNCTION exam_variant.guard_legacy_grading_row();

-- Child score and correction rows require an existing result/group root via
-- FKs. The migration preflight excludes any configured scope with such a root.
-- No session flag or privileged application bypass is provided in Phase 3A.
REVOKE ALL ON exam_variant."ExamGradingFence" FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA exam_variant FROM PUBLIC;
DO $protect$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON exam_variant."ExamGradingFence" FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA exam_variant FROM %I',role_name);
  END LOOP;
END;
$protect$;
COMMIT;
