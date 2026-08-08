/*
  Warnings:

  - You are about to drop the `CourseSpecReviewAction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CourseSpecReviewAction" DROP CONSTRAINT "CourseSpecReviewAction_actorId_fkey";

-- DropForeignKey
ALTER TABLE "CourseSpecReviewAction" DROP CONSTRAINT "CourseSpecReviewAction_courseSpecId_fkey";

-- DropTable
DROP TABLE "CourseSpecReviewAction";

-- DropEnum
DROP TYPE "CourseSpecReviewActionType";
