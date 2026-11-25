-- Additive: existing rubrics and their hashes retain legacy semantics.
ALTER TABLE "Rubric" ADD COLUMN "instrumentKind" TEXT NOT NULL DEFAULT 'rubric';
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_instrumentKind_check" CHECK ("instrumentKind" IN ('rubric', 'marking_scheme'));
ALTER TABLE "RubricCriterion" ADD COLUMN "maxPoints" DOUBLE PRECISION;
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_maxPoints_check" CHECK ("maxPoints" IS NULL OR ("maxPoints" > 0 AND "maxPoints" < 'Infinity'::double precision));
