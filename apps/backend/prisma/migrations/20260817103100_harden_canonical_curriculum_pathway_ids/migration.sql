-- Issue #371 canonical-pathway hardening.
-- Normalize any legacy backfill IDs to the repository's UUID-shaped convention,
-- keep FK references through ON UPDATE CASCADE, and make revision cloning copy
-- official declared totals together with course export snapshots.

UPDATE public."ProgrammeCurriculumPathway"
SET "id" =
  substr(md5("curriculumVersionId" || ':' || "code" || ':pathway'), 1, 8) || '-' ||
  substr(md5("curriculumVersionId" || ':' || "code" || ':pathway'), 9, 4) || '-4' ||
  substr(md5("curriculumVersionId" || ':' || "code" || ':pathway'), 14, 3) || '-a' ||
  substr(md5("curriculumVersionId" || ':' || "code" || ':pathway'), 18, 3) || '-' ||
  substr(md5("curriculumVersionId" || ':' || "code" || ':pathway'), 21, 12)
WHERE "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public."ProgrammeCurriculumCourse"
SET "id" =
  substr(md5("id" || ':canonical-placement'), 1, 8) || '-' ||
  substr(md5("id" || ':canonical-placement'), 9, 4) || '-4' ||
  substr(md5("id" || ':canonical-placement'), 14, 3) || '-a' ||
  substr(md5("id" || ':canonical-placement'), 18, 3) || '-' ||
  substr(md5("id" || ':canonical-placement'), 21, 12)
WHERE "pathwayId" IS NOT NULL
  AND "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

CREATE OR REPLACE FUNCTION public."clone_programme_curriculum_pathways"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."basedOnVersionId" IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public."ProgrammeCurriculumPathway" (
    "id", "curriculumVersionId", "code", "name", "yearLevel", "semester",
    "isDefault", "creditTarget", "sortOrder"
  )
  SELECT
    substr(md5(NEW."id" || ':' || "code" || ':pathway'), 1, 8) || '-' ||
    substr(md5(NEW."id" || ':' || "code" || ':pathway'), 9, 4) || '-4' ||
    substr(md5(NEW."id" || ':' || "code" || ':pathway'), 14, 3) || '-a' ||
    substr(md5(NEW."id" || ':' || "code" || ':pathway'), 18, 3) || '-' ||
    substr(md5(NEW."id" || ':' || "code" || ':pathway'), 21, 12),
    NEW."id", "code", "name", "yearLevel", "semester",
    "isDefault", "creditTarget", "sortOrder"
  FROM public."ProgrammeCurriculumPathway"
  WHERE "curriculumVersionId" = NEW."basedOnVersionId";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION curriculum_artifact."clone_revision_artifact"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."basedOnVersionId" IS NULL THEN RETURN NEW; END IF;

  INSERT INTO curriculum_artifact."DeclaredTotals" (
    "curriculumVersionId", "semesterCredits", "pathwayCredits",
    "programmeCourseCount", "programmeCredits"
  )
  SELECT
    NEW."id", "semesterCredits", "pathwayCredits",
    "programmeCourseCount", "programmeCredits"
  FROM curriculum_artifact."DeclaredTotals"
  WHERE "curriculumVersionId" = NEW."basedOnVersionId";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
