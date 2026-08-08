DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'CourseSpecReviewAction'
    ) THEN
        ALTER TABLE "CourseSpecReviewAction"
        DROP CONSTRAINT IF EXISTS "CourseSpecReviewAction_actorId_fkey";

        ALTER TABLE "CourseSpecReviewAction"
        DROP CONSTRAINT IF EXISTS "CourseSpecReviewAction_courseSpecId_fkey";

        DROP TABLE "CourseSpecReviewAction";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'CourseSpecReviewActionType'
    ) THEN
        DROP TYPE "CourseSpecReviewActionType";
    END IF;
END $$;