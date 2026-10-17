ALTER TABLE student_handbook."StudentHandbookBlock"
  DROP CONSTRAINT IF EXISTS "StudentHandbookBlock_sourceKind_check";

ALTER TABLE student_handbook."StudentHandbookBlock"
  ADD CONSTRAINT "StudentHandbookBlock_sourceKind_check"
  CHECK (
    "sourceKind" IS NULL
    OR "sourceKind" IN (
      'CURRICULUM_SUMMARY',
      'PROGRAMME_PROFILE',
      'PROGRAMME_CONTACT',
      'ACADEMIC_CALENDAR_LINKS'
    )
  );
