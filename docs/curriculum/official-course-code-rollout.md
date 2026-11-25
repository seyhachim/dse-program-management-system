# Official course codes by curriculum version (#1347)

Draft implementation; no release or production import is authorized.

## First slice: existing snapshot read projection

- Canonical identity is Course.id; Course.code remains globally unique.
- Existing curriculum_artifact.CourseSnapshot.courseCodeSnapshot is the candidate version-owned official code. Use exact placement/version/course identity, never code-only joins.
- Curriculum study plan, pathway rows, CourseSpec binding labels and offering placement selection now read the existing snapshot code; unchanged legacy fallback when a matching snapshot is absent.
- No changes to Prisma, shared CourseSpec authoring, policy register, authorization, production data or approved history in this slice.
- Synthetic database regression exercises two independent course identities and one shared official code, plus Draft offering denial.

## Remaining merge blockers

1. Decide and enforce a single version-wide official-code invariant in PostgreSQL, accounting for legacy detached snapshots and existing approved records. Prefer existing snapshot authority over redundant persisted code; audit current data before additive migration.
2. Extend importer contract with official code and explicit canonical catalogue lookup; preview, apply, decisions and round-trip exports must agree. An ambiguous title conflict must not silently bind G6 to G5. Validate same-version collisions even across pathways; preserve legacy JSON.
3. Draft editor mutation and audit, revision cloning, comparison (including alternate pathways and code-only change), integrity diagnostics, and contextual offering/CourseSpec/student/report displays still require audit and tests. The current read projection is not the complete feature.
4. Add G5 approved/G6 draft and approved delivery regressions, duplicate/rollback/security cases and browser verification. Validate staging before any release.
5. Keep G6 v3.0 Draft until academic review resolves 132-credit research/industry routes against 130-credit limit. No import or approval in this PR until the full feature is verified.
6. Coordinate additive migration ordering and rebase with #1354, #1362, #1299, #1364 and #1352. This initial slice intentionally avoids their changed files. No Vercel configuration changes; retain existing preview/deployment policy.

Verification required: prisma validate, typecheck, lint, test, test:backend, build, fresh database migrate/seed/security verification and curriculum DB tests.
