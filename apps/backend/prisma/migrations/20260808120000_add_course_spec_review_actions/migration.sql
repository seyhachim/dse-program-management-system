CREATE TYPE "CourseSpecReviewActionType" AS ENUM ('Submitted', 'Resubmitted', 'ChangesRequested', 'Approved');

CREATE TABLE "CourseSpecReviewAction" (
    "id" TEXT NOT NULL,
    "courseSpecId" TEXT NOT NULL,
    "submissionVersion" INTEGER NOT NULL,
    "action" "CourseSpecReviewActionType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSpecReviewAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseSpecReviewAction_courseSpecId_createdAt_idx" ON "CourseSpecReviewAction"("courseSpecId", "createdAt");
CREATE INDEX "CourseSpecReviewAction_actorId_idx" ON "CourseSpecReviewAction"("actorId");

ALTER TABLE "CourseSpecReviewAction"
ADD CONSTRAINT "CourseSpecReviewAction_courseSpecId_fkey"
FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseSpecReviewAction"
ADD CONSTRAINT "CourseSpecReviewAction_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "slug", "title", "active", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'courses:review', 'Review and approve course specifications', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE
SET "title" = EXCLUDED."title", "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt", "updatedAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."slug" IN ('admin', 'program_coordinator')
  AND p."slug" = 'courses:review'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
