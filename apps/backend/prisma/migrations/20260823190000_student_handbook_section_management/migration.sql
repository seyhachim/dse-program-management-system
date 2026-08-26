ALTER TABLE student_handbook."StudentHandbookSection"
  ADD COLUMN "isCore" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE student_handbook."StudentHandbookSection"
SET "isCore" = TRUE
WHERE "key" IN (
  'welcome',
  'degree',
  'study-plan',
  'attendance-leave',
  'assessment-grades',
  'academic-integrity-ai',
  'internship',
  'student-support',
  'facilities-digital-services',
  'important-contacts'
);

UPDATE student_handbook."StudentHandbookSection"
SET "title" = 'Study Plan & Curriculum'
WHERE "key" = 'study-plan'
  AND "title" = 'Study Plan';
