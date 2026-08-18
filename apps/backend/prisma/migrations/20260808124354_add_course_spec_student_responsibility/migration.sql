-- This migration previously altered CourseSpecResource.kind before that
-- column existed and dropped CourseSpecReference before preserving its data.
--
-- Resource unification and legacy-reference migration are handled by later
-- migrations. This migration intentionally makes no database changes.
SELECT 1;