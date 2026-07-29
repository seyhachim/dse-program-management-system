-- DropForeignKey
ALTER TABLE "CourseCoLecturer" DROP CONSTRAINT "CourseCoLecturer_courseId_fkey";

-- DropForeignKey
ALTER TABLE "CourseCoLecturer" DROP CONSTRAINT "CourseCoLecturer_lecturerId_fkey";

-- DropTable
DROP TABLE "CourseCoLecturer";

-- CreateTable
CREATE TABLE "OfferingCoLecturer" (
    "offeringId" TEXT NOT NULL,
    "lecturerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferingCoLecturer_pkey" PRIMARY KEY ("offeringId","lecturerId")
);

-- CreateIndex
CREATE INDEX "OfferingCoLecturer_lecturerId_idx" ON "OfferingCoLecturer"("lecturerId");

-- AddForeignKey
ALTER TABLE "OfferingCoLecturer" ADD CONSTRAINT "OfferingCoLecturer_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingCoLecturer" ADD CONSTRAINT "OfferingCoLecturer_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

