-- CreateTable
CREATE TABLE "CourseCoLecturer" (
    "courseId" TEXT NOT NULL,
    "lecturerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseCoLecturer_pkey" PRIMARY KEY ("courseId","lecturerId")
);

-- CreateIndex
CREATE INDEX "CourseCoLecturer_lecturerId_idx" ON "CourseCoLecturer"("lecturerId");

-- AddForeignKey
ALTER TABLE "CourseCoLecturer" ADD CONSTRAINT "CourseCoLecturer_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCoLecturer" ADD CONSTRAINT "CourseCoLecturer_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
