-- Programme-managed Teaching & Learning vocabulary (issue #166).
-- Keep existing method IDs and existing active-learning strategy slugs stable so
-- historical Course Specifications continue to resolve after rollout.

ALTER TABLE "TeachingMethod"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "TeachingMethod" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "TeachingMethod" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "AssessmentMethod"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "AssessmentMethod" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "AssessmentMethod" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "ActiveLearningCluster" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActiveLearningCluster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ActiveLearningStrategy" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActiveLearningStrategy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActiveLearningStrategy_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "ActiveLearningCluster"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ActiveLearningCluster_active_sortOrder_idx"
  ON "ActiveLearningCluster"("active", "sortOrder");
CREATE INDEX IF NOT EXISTS "ActiveLearningStrategy_clusterId_active_sortOrder_idx"
  ON "ActiveLearningStrategy"("clusterId", "active", "sortOrder");

INSERT INTO "ActiveLearningCluster" ("id", "name", "description", "sortOrder", "updatedAt") VALUES
  ('collaborate', 'Collaborate', 'Students learn with others.', 10, CURRENT_TIMESTAMP),
  ('solve', 'Solve', 'Students investigate and solve problems.', 20, CURRENT_TIMESTAMP),
  ('practice', 'Practice', 'Students learn by doing.', 30, CURRENT_TIMESTAMP),
  ('reflect', 'Reflect', 'Students improve through reflection and feedback.', 40, CURRENT_TIMESTAMP),
  ('communicate', 'Communicate', 'Students explain and present what they know.', 50, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ActiveLearningStrategy" ("id", "name", "clusterId", "sortOrder", "updatedAt") VALUES
  ('think-pair-share', 'Think–Pair–Share', 'collaborate', 10, CURRENT_TIMESTAMP),
  ('group-discussion', 'Group Discussion', 'collaborate', 20, CURRENT_TIMESTAMP),
  ('peer-instruction', 'Peer Instruction', 'collaborate', 30, CURRENT_TIMESTAMP),
  ('jigsaw', 'Jigsaw', 'collaborate', 40, CURRENT_TIMESTAMP),
  ('team-problem-solving', 'Team Problem Solving', 'collaborate', 50, CURRENT_TIMESTAMP),
  ('problem-based-learning', 'Problem-Based Learning', 'solve', 10, CURRENT_TIMESTAMP),
  ('case-based-learning', 'Case-Based Learning', 'solve', 20, CURRENT_TIMESTAMP),
  ('inquiry-activity', 'Inquiry Activity', 'solve', 30, CURRENT_TIMESTAMP),
  ('data-investigation', 'Data Investigation', 'solve', 40, CURRENT_TIMESTAMP),
  ('hands-on-lab', 'Hands-on Lab', 'practice', 10, CURRENT_TIMESTAMP),
  ('coding-exercise', 'Coding Exercise', 'practice', 20, CURRENT_TIMESTAMP),
  ('project-based-learning', 'Project-Based Learning', 'practice', 30, CURRENT_TIMESTAMP),
  ('prototype-build', 'Prototype / Build Task', 'practice', 40, CURRENT_TIMESTAMP),
  ('peer-review', 'Peer Review', 'reflect', 10, CURRENT_TIMESTAMP),
  ('minute-paper', 'Minute Paper', 'reflect', 20, CURRENT_TIMESTAMP),
  ('reflection', 'Reflection', 'reflect', 30, CURRENT_TIMESTAMP),
  ('self-assessment', 'Self-Assessment', 'reflect', 40, CURRENT_TIMESTAMP),
  ('presentation', 'Presentation', 'communicate', 10, CURRENT_TIMESTAMP),
  ('debate', 'Debate', 'communicate', 20, CURRENT_TIMESTAMP),
  ('demo', 'Demo', 'communicate', 30, CURRENT_TIMESTAMP),
  ('poster-sharing', 'Poster Sharing', 'communicate', 40, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
