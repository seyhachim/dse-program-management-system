-- Row Level Security was enabled on most tables outside of Prisma migrations
-- (no prior migration file contains ENABLE ROW LEVEL SECURITY), so every table
-- added since has been missed. These 8 were flagged by the Supabase security
-- advisor (lint 0013, rls_disabled_in_public) as publicly exposed via
-- PostgREST with no RLS at all. The app itself is unaffected: it connects as
-- the `postgres` role, which has rolbypassrls = true, and the app already
-- reads/writes the other 14 tables that have RLS enabled with zero policies.
ALTER TABLE "UserRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RubricLevel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RubricCriterion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RubricCell" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecClo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecCloTeachingMethod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecCloAssessmentMethod" ENABLE ROW LEVEL SECURITY;
