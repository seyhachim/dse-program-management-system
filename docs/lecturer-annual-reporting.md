# Lecturer Annual Activity & Evidence — MVP (#1298)

## Scope
This adds the **annual programme review layer**, not a new lecturer portfolio.
Teaching is derived from canonical Offerings plus actual class-delivery records.
Lecturers reuse the existing professional evidence forms and link relevant items
to an AcademicYear. Verification continues through existing portfolio review.

## Workflows
- Coordinator: `/annual-lecturer-activities` → select an academic year →
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
- Current employment type and qualification are informational, not a verified
  historical HR snapshot. The approved release preserves the values as shown
  when it was released.
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
