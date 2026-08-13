-- Issue #150 phase C: every Course belongs to exactly one programme, unlike
-- UserRoleAssignment.programmeId (which stays nullable — null there means a
-- deliberate global grant, not un-backfilled data). Verified against
-- production before writing this: 0 nulls across every existing Course row.
-- The UPDATE is a no-op today but makes this migration self-healing rather
-- than assuming that stays true between now and deploy.
--
-- NOTE: this migration was hand-written, not `prisma migrate dev`-generated.
-- The auto-generated diff also proposed dropping CourseSpecTeachingLearning
-- and CourseSpecWeekProjectProgress — real, populated tables (accessed via
-- raw SQL in teaching-learning/service.ts, never declared as Prisma models,
-- so `prisma migrate dev` sees them as drift to reconcile away). Do not let
-- a future auto-generated migration touch those tables.
UPDATE "Course" SET "programmeId" = 'dse' WHERE "programmeId" IS NULL;

ALTER TABLE "Course" ALTER COLUMN "programmeId" SET NOT NULL;
