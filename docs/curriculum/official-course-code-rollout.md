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

## Remaining merge blockers

1. Validate the new version-wide constraint and duplicate preflight on isolated staging, including detached legacy snapshots. No production migration or data correction authorized.
2. Verify import/export round trip and error UI, additional conflict/concurrency cases and browser smoke; official document export must not display internal aliases.
3. Verify Phase 4B CI, staff contextual PDF/Word browser output and authorization, and remaining direct reports. Coordinate annual lecturer export #1299; no dedicated transcript implementation was found.
4. Run cross-generation synthetic regressions and duplicate/rollback/security cases, then isolated staging and browser verification before any release.
5. Keep G6 v3.0 Draft until academic review resolves 132-credit research/industry routes against 130-credit limit. No import or approval in this PR until the full feature is verified.
6. Coordinate additive migration ordering and rebase with #1354, #1362, #1299, #1364 and #1352. This initial slice intentionally avoids their changed files. No Vercel configuration changes; retain existing preview/deployment policy.

Verification required: prisma validate, typecheck, lint, test, test:backend, build, fresh database migrate/seed/security verification and curriculum DB tests.
