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

## Phase 3: Draft editor and history

- Optional official code on add, explicit reason for a changed official code on edit. Exact placement/version/course scope; lock Draft version and recheck review marker, audit old/new codes transactionally, enforce duplicate protection and preserve canonical identity.
- Alternate pathway rows expose code-only editing; default route retains existing editing. Existing canonical revision trigger copies official code by course identity; regression verifies clone and approved history rather than replacing the trigger.
- Comparison covers all pathways, deduplicates the default route by course identity, and displays code-only changes with old/new codes.
- Phase 2 CI: 16/17 workflows passed; import suite failed because Bun expected a native Promise rather than PrismaPromise for the duplicate assertion. Fixed to execute the real rejection and check the constraint name. Fresh CI required.

## Phase 4: contextual offering and curriculum projections (first integration slice)

- Shared server-only offering code resolver batches exact offering binding, placement, canonical course identity, allowed version status, and immutable snapshot. Unbound historical offerings retain catalogue code; no cohort inference. Used for portal summaries/home/announcements/assessments/downloadable approved CourseSpec document, delivery lists, result review, offering views and pending attendance permissions.
- Curriculum competency map and missing CourseSpec-binding diagnostics use exact version codes; new competency audit records retain both official and catalogue codes.
- QA lecturer assignment and weekly workload candidate reads use exact offering labels; historical evidence and aggregated result sets remain unchanged. Standalone CourseSpec, rubric and catalogue evidence with no exact context keep catalogue labels rather than guessing.
- Existing approved course documents served through the portal inherit the contextual summary code; staff standalone CourseSpec printing, transcript/report inventory and all other direct SQL/export paths still need audit and explicit context handling.
- Correct Phase 3 duplicate test assertion to SQLSTATE 23505. Prior CI showed the database really rejected the duplicate and Phase 3 editor/clone comparison passed. New CI required.

## Phase 4B: documents, delivery and evidence

- Phase 4A baseline commit ebec39d passed all 17 Actions workflows.
- Curriculum CourseSpec bindings now link to an exact historical CourseSpec preview with version and placement IDs. The existing programme-scoped binding API must confirm the exact course, exact approved spec and Approved/Active/Superseded curriculum before the preview or either export renders. Invalid or Draft context fails closed; standalone historic documents retain stored codes. PDF, Word, header/footer and filenames share the resolved presentation model.
- Teaching-session monitor and lecturer portfolio teaching projections resolve exact offering codes. Existing portal/Telegram schedule and attendance screens use the contextual portal or offering projections; schedule-impact rows remain ID-based.
- CLO attainment evidence candidate display and published result aggregates expose contextual codes without mutating stored evidence or changing aggregate keys. Mixed or unbound result sets retain the catalogue label and expose code coverage.
- Student handbook source is published curriculum totals, not course rows; export already freezes published source snapshots, so no handbook data rewrite is appropriate. No dedicated transcript implementation found in the inspected tree. Standalone reports without exact context retain catalogue labels; annual lecturer export is owned by #1299 and needs coordination, not a competing patch.
- Added context validation unit tests and expanded portal DB regression for exact bound code, document filename, announcement, legacy completed fallback and unauthorized access. Added synthetic two-generation offering/QA candidate test and contextual CLO attainment/published results regression. Full cross-generation browser verification remains a release gate.

## Phase 5: release readiness evidence (2026-11-25)

- Phase 4B exact-head e125840: all 17 Actions workflows passed, including browser smoke baseline.
- Read-only Neon staging verification: existing separate project dse-pms-staging, Free plan, database marker matches expected; snapshot table exists, zero snapshot rows, zero curriculum versions, zero duplicate groups, feature migration not applied. Existing account fixtures have not been independently validated, so no branch copy or migration was made. Annual lecturer UAT branches untouched. Hosted frontend/backend/auth still not verified.
- Source candidate retrieved from previous G6 preview JSON. Converted only AAI302-G6 to official AAI302 plus catalogueCode AAI302-G6; committed redacted fixture (lecturer text omitted for CI). Source arithmetic: 44 rows, 42 default-route courses / 126 credits, research/industry 39 courses / 132 credits each. Keep Draft; 130-credit cap requires academic decision. No actual production import or approval.
- Full source-shape preview regression uses isolated synthetic catalogue, verifies no placement/audit/status writes and exact alias resolution. It is not a production catalogue preview.
- Added authenticated local Playwright test for exact contextual PDF and Word downloads (signature, filename, mobile), Draft and wrong-placement denial, and student API denial; runs in disposable CI only. Latest execution still required.
- Do not run a manual SQL migration on persistent staging; use reviewed Prisma migration runner on a separately verified synthetic-only target. No Vercel or Render deployment was requested.

## Phase 5 browser fixture correction

- Commit 33e0073: 16/17 workflows passed; Main CI passed typecheck/lint/tests/build, fresh migration/seed/security and backend authorization. Chromium: 36 passed, one failed twice at the document-page visibility assertion, before either download.
- The selector is the real PDF-renderer attribute. The generic seed creates an already Approved CS101 CourseSpec after migrations, without a version theme snapshot or exact grading policy binding. The official preview correctly blocks missing style rather than inventing historical formatting. The historical grading API also requires an exact saved binding.
- New smoke fixture script is restricted to the local disposable dse_browser database and creates a distinct synthetic Draft CourseSpec, binds an approved policy, saves its theme and course-info snapshot, then locks only that fixture. It never changes existing Approved specs. The test verifies the theme and grading APIs before navigation, requires the official code inside a real document page, retains download signature/filename checks and asserts Draft/invalid placement hides downloads. Fresh CI required.
- No production code, schema, seed, real academic records, or deployment changes in this correction.

## Dedicated staging acceptance (2026-11-25)

- Actual live catalogue inspection found v3.0 already Approved on November 24. Preserve it; do not unlock or rewrite history. G5 v1.0 remains Approved. 140 live snapshots / zero duplicate groups. Corrected source matched all 44 live catalogue entries; only code differs from the checked v3.0 snapshot. No live writes.
- Dedicated Neon branch uat-pr1365-curriculum-official-codes, database dse_pr1365, identity marker DSE-PMS-STAGING:pr1365-isolated-20261125; direct endpoint ep-lively-bonus-a1lpsxjs.ap-southeast-1.aws.neon.tech. Fresh database, not the inherited neondb with #1362's migration. No shared or production credential reuse.
- New test reproduces full synthetic G5 and G6 v3.0 approval, uses the normal revision and Draft edit services to create v3.1, checks exact one-code comparison, preserved predecessor artifacts/placements/audits, 44 matched preview rows, 126/132/132 credits, immutable catalogue code and Draft status. Redacted source fixture only.
- Guarded local runner: after checkout and dependency install, configure DATABASE_URL privately for the direct endpoint and the five existing DSE_STAGING_* variables (true, exact host, database, marker, forbidden production host list). Run `bun apps/backend/scripts/verify-pr1365-staging.ts`. It pins the target, invokes the existing guard, checks duplicates, applies reviewed Prisma migrations, verifies recorded migration and deferrable unique constraint, runs security verifier, runs only the corrective revision test, then rechecks security. Do not run with production credentials. No server, seed, notifications or deployments.
- Hosted runner execution remains unverified. Exact-head 9e783bc CI previously 17/17, Chromium 37/37. New regression requires fresh CI. The current live v3.0 cannot receive a Draft import; only a governed corrective revision after release can do so.

## Remaining merge blockers

1. Validate the new version-wide constraint and duplicate preflight on isolated staging, including detached legacy snapshots. No production migration or data correction authorized.
2. Verify import/export round trip and error UI, additional conflict/concurrency cases and browser smoke; official document export must not display internal aliases.
3. Verify Phase 4B CI, staff contextual PDF/Word browser output and authorization, and remaining direct reports. Coordinate annual lecturer export #1299; no dedicated transcript implementation was found.
4. Run cross-generation synthetic regressions and duplicate/rollback/security cases, then isolated staging and browser verification before any release.
5. Preserve already Approved G6 v3.0. Keep a future corrective v3.1 Draft until academic review resolves 132-credit research/industry routes against 130-credit limit. No live import or approval in this PR.
6. Coordinate additive migration ordering and rebase with #1354, #1362, #1299, #1364 and #1352. This initial slice intentionally avoids their changed files. No Vercel configuration changes; retain existing preview/deployment policy.

Verification required: prisma validate, typecheck, lint, test, test:backend, build, fresh database migrate/seed/security verification and curriculum DB tests.
