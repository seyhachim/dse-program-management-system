-- CreateTable
CREATE TABLE "CourseSpecStudentResponsibility" (
    "id" TEXT NOT NULL,
    "courseSpecId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "CourseSpecStudentResponsibility_pkey" PRIMARY KEY ("courseSpecId", "id")
);

-- CreateIndex
CREATE INDEX "CourseSpecStudentResponsibility_courseSpecId_order_idx" ON "CourseSpecStudentResponsibility"("courseSpecId", "order");

-- AddForeignKey
ALTER TABLE "CourseSpecStudentResponsibility" ADD CONSTRAINT "CourseSpecStudentResponsibility_courseSpecId_fkey" FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the normalized CourseSpec tables protected consistently.
ALTER TABLE "CourseSpecStudentResponsibility" ENABLE ROW LEVEL SECURITY;
