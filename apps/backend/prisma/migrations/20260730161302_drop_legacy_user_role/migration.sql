-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
DROP COLUMN "roleId";

-- DropEnum
DROP TYPE "UserRole";

