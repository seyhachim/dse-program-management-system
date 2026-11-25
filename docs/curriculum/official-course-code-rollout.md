# Official course codes by curriculum version (#1347)

Draft implementation; no release or production import is authorized.

## First slice: existing snapshot read projection

- Canonical identity is Course.id; Course.code remains globally unique.
- Existing curriculum_artifact.CourseSnapshot.courseCodeSnapshot is the candidate version-owned official code. Use exact placement/version/course identity, never code-only joins.
- Curriculum study plan, pathway rows, CourseSpec binding labels and offering placement selection now read the existing snapshot code; unchanged legacy fallback when a matching snapshot is absent.
- No changes to Prisma, shared CourseSpec authoring, policy register, authorization, production data or approved history in this slice.
- Synthetic database regression exercises two independent course identities and one shared official code, plus Draft offering denial.

## Phase 2: import and database integrity

- Backward-compatible JSON: `code` is the official version-owned code; optional `catalogueCode` selects a different existing canonical Course within the programme. Decisions remain keyed by official code. Explicit alias must match the selected course title; alias creation is not automatic. Legacy title conflicts with another exact title match require explicit catalogue identity.
- Import validates official and canonical uniqueness across all pathways. Preview and transactional apply independently resolve the same catalogue identity. Artifact response includes the lookup code when different; import audit records the alias and resolved ID.
- Migration replaces the redundant scope-level unique index with a stronger version-wide deferrable unique constraint on existing snapshots. It changes no data, fails atomically on any pre-existing duplicate, and permits import trigger intermediate codes only within the transaction.
- Before staging migration, run the duplicate preflight from the migration on the target DB. If there are duplicates, review them without rewriting approved history. Never bypass the invariant.
- DB regression covers approved old course, ambiguous legacy import rejection, distinct G6 Draft identity, artifact lookup, direct duplicate rejection and immutable old curriculum. Actual CI results pending.

## Remaining merge blockers

1. Validate the new version-wide constraint and duplicate preflight on isolated staging, including detached legacy snapshots. No production migration or data correction authorized.
2. Verify import/export round trip and error UI, additional conflict/concurrency cases and browser smoke; official document export must not display internal aliases.
3. Draft editor mutation and audit, revision cloning, comparison (including alternate pathways and code-only change), integrity diagnostics, and contextual offering/CourseSpec/student/report displays still require audit and tests. The current read projection is not the complete feature.
4. Add G5 approved/G6 draft and approved delivery regressions, duplicate/rollback/security cases and browser verification. Validate staging before any release.
5. Keep G6 v3.0 Draft until academic review resolves 132-credit research/industry routes against 130-credit limit. No import or approval in this PR until the full feature is verified.
6. Coordinate additive migration ordering and rebase with #1354, #1362, #1299, #1364 and #1352. This initial slice intentionally avoids their changed files. No Vercel configuration changes; retain existing preview/deployment policy.

Verification required: prisma validate, typecheck, lint, test, test:backend, build, fresh database migrate/seed/security verification and curriculum DB tests.
