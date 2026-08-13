-- Issue #147 phase B: phase A's backfill set every UserRoleAssignment,
-- including admin's, to programmeId = "dse" for additive simplicity.
-- admin is meant to be a global role (programmeId = NULL), per the
-- ROLE + SCOPE + PERMISSION design in issue #115's comment. Every other
-- role stays scoped to "dse" — the only programme that exists.
UPDATE "UserRoleAssignment" ura
SET "programmeId" = NULL
FROM "Role" r
WHERE ura."roleId" = r.id AND r.slug = 'admin';
