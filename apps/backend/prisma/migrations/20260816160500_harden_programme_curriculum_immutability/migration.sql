-- Complete #314 immutability: immutable curriculum versions cannot be deleted,
-- even when they have no placements or audit rows that would otherwise RESTRICT it.

CREATE OR REPLACE FUNCTION "protect_immutable_programme_curriculum_version"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('Approved', 'Active', 'Superseded') THEN
      RAISE EXCEPTION 'Approved, Active, and Superseded curriculum versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('Approved', 'Active', 'Superseded') THEN
    IF NEW."curriculumId" IS DISTINCT FROM OLD."curriculumId"
      OR NEW."versionMajor" IS DISTINCT FROM OLD."versionMajor"
      OR NEW."versionMinor" IS DISTINCT FROM OLD."versionMinor"
      OR NEW."revisionType" IS DISTINCT FROM OLD."revisionType"
      OR NEW."revisionTriggers" IS DISTINCT FROM OLD."revisionTriggers"
      OR NEW."revisionReason" IS DISTINCT FROM OLD."revisionReason"
      OR NEW."changeSummary" IS DISTINCT FROM OLD."changeSummary"
      OR NEW."basedOnVersionId" IS DISTINCT FROM OLD."basedOnVersionId"
      OR NEW."cohortLabel" IS DISTINCT FROM OLD."cohortLabel"
      OR NEW."intakeYear" IS DISTINCT FROM OLD."intakeYear"
      OR NEW."academicYear" IS DISTINCT FROM OLD."academicYear"
      OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
      OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
      OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'Approved, Active, and Superseded curriculum versions are immutable';
    END IF;

    IF OLD."status" = 'Approved' AND NEW."status" NOT IN ('Approved', 'Active') THEN
      RAISE EXCEPTION 'Approved curriculum versions can only remain Approved or become Active';
    END IF;

    IF OLD."status" = 'Active' AND NEW."status" NOT IN ('Active', 'Superseded') THEN
      RAISE EXCEPTION 'Active curriculum versions can only remain Active or become Superseded';
    END IF;

    IF OLD."status" = 'Superseded' AND NEW."status" <> 'Superseded' THEN
      RAISE EXCEPTION 'Superseded curriculum versions cannot change lifecycle state';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "ProgrammeCurriculumVersion_protect_immutable_fields"
ON "ProgrammeCurriculumVersion";

CREATE TRIGGER "ProgrammeCurriculumVersion_protect_immutable_fields"
BEFORE UPDATE OR DELETE ON "ProgrammeCurriculumVersion"
FOR EACH ROW
EXECUTE FUNCTION "protect_immutable_programme_curriculum_version"();
