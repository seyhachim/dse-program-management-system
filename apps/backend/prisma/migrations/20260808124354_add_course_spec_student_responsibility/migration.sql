/*
  Warnings:

  - You are about to drop the `CourseSpecReference` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CourseSpecReference" DROP CONSTRAINT "CourseSpecReference_courseSpecId_fkey";

-- AlterTable
ALTER TABLE "CourseSpecResource" ALTER COLUMN "kind" SET DEFAULT 'OTHER';

-- DropTable
DROP TABLE "CourseSpecReference";
