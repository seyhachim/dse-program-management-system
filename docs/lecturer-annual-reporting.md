# Lecturer Annual Activity & Evidence — MVP (#1298)

## Scope
This adds the **annual programme review layer**, not a new lecturer portfolio.
Teaching is derived from canonical Offerings plus actual class-delivery records.
Lecturers reuse the existing professional evidence forms and link relevant items
to an AcademicYear. Only items with a recorded date **overlapping the configured
  reporting window** may be linked or counted. Undated/out-of-window items are
  blocked, and records edited out of period later are flagged in summaries.
  Verification continues through existing portfolio review.

## Workflows
- Coordinator: `/annual-lecturer-activities` → select an academic year →
  **configure its verified reporting window (dates + official source)** and
  **verify historical staff employment/qualification against an HR record** →
  inspect classifications and assigned offerings → confirm or reject delivery
  with reasons/evidence → review linked portfolio evidence → release a
  versioned annual report → export CSV or Excel-compatible XML.
- Lecturer: `/annual-lecturer-activities` → select year → add items using
  `/lecturer-portfolio/evidence` → link them to year → submit.
- Unreported is **not** a verified zero. Non-teaching supervision/research/service
  counts as a separate programme contributor.
- Publications are deduplicated by normalized identifier/DOI, otherwise URL,
  otherwise title + organization; both contributor records retain attribution.

## Deployment & security
- Backend domain uses private `lecturer_annual` PostgreSQL schema. No new public
  Data API table; RLS is enabled and `anon`, `authenticated`, and `service_role`
  have no schema/table grants.
- A migration must run on the **backend database** before enabling the UI.
  Do not run migrate-dev or change Supabase production directly.
- Lecturer APIs use token-owned lecturer IDs; coordinator operations enforce
  DSE programme-scoped roles server-side. Self-review is rejected.
- Reviewed teaching has append-only event history; annual releases are
  immutable JSONB snapshots, corrected by issuing a new version.
- Historical employment type and qualification are available in the annual report
  **only after** coordinator verification of an annual staff snapshot with a source
  URL and append-only review history. Current profile values are never used as
  silent historical evidence.
- Report release fails closed while the reporting window is missing, verified
  contributors lack annual staff review, or verified linked activities are
  undated/outside the reporting period. Unreported lecturer submissions remain
  explicit and are not silently treated as zero.
- Reporting-window corrections create append-only history. Previous report
  versions are immutable snapshots with their own official dates and staff evidence.
- Reports explicitly distinguish full-time/part-time headcounts from FTE,
  and never claim a computed FTE ratio from current staff profiles.

## CSV / Excel exports
Use `GET /api/lecturers/annual/:academicYearId/export` (coordinator only);
the frontend downloads `.csv` or Excel 2003 SpreadsheetML `.xml`, which
Excel supports without adding an XLSX dependency. Both include
offering/delivery IDs, professional evidence item IDs, and verification event
IDs. No private contact information is exported.

## Known MVP boundaries
- Legacy Offerings without a canonical calendar link are matched **only if**
  their term string explicitly contains the academic-year label. Ambiguous
  legacy assignments require data cleanup; do not infer the reporting year.
- The UI requires the coordinator to provide an official date range and year-specific
  HR evidence; no calendar-year assumptions or unreviewed current HR data may
  be counted in the verified report.
- Reports show unresolved evidence and contradictions. A `not_delivered`
  review cannot override an authoritative recorded delivery; such conflicts
  require correcting the source record through its existing audit workflow.
- Lecturers lacking PMS accounts need authorized coordinator-assisted
  collection or secure external submissions in a later phase, not a public
  invitation bypass.
- This MVP reuses per-item portfolio verification rather than adding a
  separate accreditation score or AI evaluator.

## Verification
Run from repository root after a normal `bun install --frozen-lockfile`:

    bunx prisma validate --schema apps/backend/prisma/schema.prisma
    bun run typecheck
    bun run lint
    bun run test
    bun run test:backend
    bun run build

Apply migrations to a local/staging PostgreSQL copy, then run:

    bun run --cwd apps/backend db:migrate:deploy
    bun run --cwd apps/backend db:security:verify

Exercise both lecturer and coordinator roles and all seven acceptance
scenarios. The separate Vercel Hobby frontend may automatically create a
preview build for a feature branch; prefer one batched push, do not trigger
manual redeploys, and do not promote to production until database migration,
CI, QA and API checks are green.
