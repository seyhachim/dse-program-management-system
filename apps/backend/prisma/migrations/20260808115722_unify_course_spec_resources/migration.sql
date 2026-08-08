-- AlterTable
ALTER TABLE "CourseSpecResource" ADD COLUMN     "evidenceWeekIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "weekId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CourseSpecReference" (
    "id" TEXT NOT NULL,
    "courseSpecId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT NOT NULL DEFAULT '',
    "publisher" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "isbn" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "basedOn" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CourseSpecReference_pkey" PRIMARY KEY ("courseSpecId","id")
);

-- CreateIndex
CREATE INDEX "CourseSpecReference_courseSpecId_kind_idx" ON "CourseSpecReference"("courseSpecId", "kind");

-- AddForeignKey
ALTER TABLE "CourseSpecReference" ADD CONSTRAINT "CourseSpecReference_courseSpecId_fkey" FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;
