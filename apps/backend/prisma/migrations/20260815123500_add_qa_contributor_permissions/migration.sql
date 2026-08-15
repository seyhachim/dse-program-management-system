-- Issue #224: additive QA contributor role and granular QA permission vocabulary.
-- Existing qa:write grants remain untouched during the migration window.

INSERT INTO "Permission" ("id", "slug", "title", "description", "active", "createdAt", "updatedAt")
VALUES
  ('perm-qa-contribute', 'qa:contribute', 'Contribute to QA and SAR work', 'Write assigned QA/SAR content and attach supporting evidence without programme-management authority.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-qa-review', 'qa:review', 'Review QA and SAR work', 'Review evidence findings and SAR submissions without changing programme administration.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm-qa-manage', 'qa:manage', 'Manage programme QA workspace', 'Manage QA cycles, assignments, and programme-level SAR workflow configuration.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Role" ("id", "slug", "title", "description", "active", "createdAt", "updatedAt")
VALUES (
  'role-qa-contributor',
  'qa_contributor',
  'QA Contributor',
  'Programme staff member who contributes to assigned AUN-QA evidence and SAR work without programme-management or approval authority.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- QA contributors can read the QA workspace and contribute content/evidence.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt", "updatedAt")
SELECT r.id, p.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p.slug IN ('qa:read', 'qa:contribute')
WHERE r.slug = 'qa_contributor'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Preserve current reviewer behavior while introducing the narrower review boundary.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt", "updatedAt")
SELECT r.id, p.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p.slug IN ('qa:contribute', 'qa:review')
WHERE r.slug = 'qa_reviewer'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Programme leadership receives the complete granular permission set.
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt", "updatedAt")
SELECT r.id, p.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p.slug IN ('qa:contribute', 'qa:review', 'qa:manage')
WHERE r.slug IN ('admin', 'program_coordinator')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
