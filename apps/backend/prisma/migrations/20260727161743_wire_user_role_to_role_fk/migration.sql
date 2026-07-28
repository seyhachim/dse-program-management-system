-- Phase 2 of issue #65 (wiring, tracked in #67): adds User.roleId as a real FK to
-- Role, backfilled from the existing UserRole enum column. User.role is left in
-- place (not dropped) so a mid-deploy state can't break either version of the
-- code — dropping it is a separate follow-up once this has run in production.
--
-- The Role rows this backfill depends on are inserted here rather than assumed
-- to exist from `bun run seed`: phase 1's migration (20260727120000) created the
-- Role table but never populated it outside of local dev seeding, so on a fresh
-- environment (including live Supabase today) the table is empty at this point.

-- AlterTable: add roleId nullable first, since the User table isn't empty and a
-- NOT NULL column needs a value for every existing row before it can be enforced.
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;

-- Seed the 3 roles this backfill needs. Idempotent: harmless if `bun run seed`
-- already created them (e.g. local dev), required if it hasn't (e.g. Supabase).
INSERT INTO "Role" ("id", "slug", "title", "description", "active", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'admin', 'Admin', 'Full curriculum-admin access.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'lecturer', 'Lecturer', 'Reads the catalog and fills in the specification of assigned courses/offerings.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'student', 'Student', 'Read-only access to the catalog.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Backfill: every existing User's roleId from its current enum value.
UPDATE "User" u
SET "roleId" = r."id"
FROM "Role" r
WHERE r."slug" = u."role"::text;

-- AlterTable: now that every row has a roleId, enforce NOT NULL.
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
