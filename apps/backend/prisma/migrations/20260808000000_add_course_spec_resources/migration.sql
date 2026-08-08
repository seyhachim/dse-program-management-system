CREATE TABLE "CourseSpecResource" (
  "id" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "weekId" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "url" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "CourseSpecResource_pkey" PRIMARY KEY ("courseSpecId", "id")
);

CREATE INDEX "CourseSpecResource_courseSpecId_weekId_idx"
ON "CourseSpecResource"("courseSpecId", "weekId");

ALTER TABLE "CourseSpecResource"
ADD CONSTRAINT "CourseSpecResource_courseSpecId_fkey"
FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
