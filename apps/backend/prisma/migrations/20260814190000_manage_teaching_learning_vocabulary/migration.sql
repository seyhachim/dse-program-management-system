-- Programme-managed Teaching & Learning vocabulary (issue #166).
-- Keep existing method IDs and existing active-learning strategy slugs stable so
-- historical Course Specifications continue to resolve after rollout.

ALTER TABLE "TeachingMethod"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "AssessmentMethod"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "ActiveLearningCluster" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActiveLearningCluster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ActiveLearningStrategy" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActiveLearningStrategy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActiveLearningStrategy_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "ActiveLearningCluster"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ActiveLearningCluster_active_sortOrder_idx"
  ON "ActiveLearningCluster"("active", "sortOrder");
CREATE INDEX IF NOT EXISTS "ActiveLearningStrategy_clusterId_active_sortOrder_idx"
  ON "ActiveLearningStrategy"("clusterId", "active", "sortOrder");

INSERT INTO "ActiveLearningCluster" ("id", "name", "description", "sortOrder") VALUES
  ('collaborate', 'Collaborate', 'Students learn with others.', 10),
  ('solve', 'Solve', 'Students investigate and solve problems.', 20),
  ('practice', 'Practice', 'Students learn by doing.', 30),
  ('reflect', 'Reflect', 'Students improve through reflection and feedback.', 40),
  ('communicate', 'Communicate', 'Students explain and present what they know.', 50)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ActiveLearningStrategy" ("id", "name", "clusterId", "sortOrder") VALUES
  ('think-pair-share', 'Think–Pair–Share', 'collaborate', 10),
  ('group-discussion', 'Group Discussion', 'collaborate', 20),
  ('peer-instruction', 'Peer Instruction', 'collaborate', 30),
  ('jigsaw', 'Jigsaw', 'collaborate', 40),
  ('team-problem-solving', 'Team Problem Solving', 'collaborate', 50),
  ('problem-based-learning', 'Problem-Based Learning', 'solve', 10),
  ('case-based-learning', 'Case-Based Learning', 'solve', 20),
  ('inquiry-activity', 'Inquiry Activity', 'solve', 30),
  ('data-investigation', 'Data Investigation', 'solve', 40),
  ('hands-on-lab', 'Hands-on Lab', 'practice', 10),
  ('coding-exercise', 'Coding Exercise', 'practice', 20),
  ('project-based-learning', 'Project-Based Learning', 'practice', 30),
  ('prototype-build', 'Prototype / Build Task', 'practice', 40),
  ('peer-review', 'Peer Review', 'reflect', 10),
  ('minute-paper', 'Minute Paper', 'reflect', 20),
  ('reflection', 'Reflection', 'reflect', 30),
  ('self-assessment', 'Self-Assessment', 'reflect', 40),
  ('presentation', 'Presentation', 'communicate', 10),
  ('debate', 'Debate', 'communicate', 20),
  ('demo', 'Demo', 'communicate', 30),
  ('poster-sharing', 'Poster Sharing', 'communicate', 40)
ON CONFLICT ("id") DO NOTHING;
