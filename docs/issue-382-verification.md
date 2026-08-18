# Issue #382 verification scope

This branch adds the lecturer-facing finalized-result correction UI and staff-only audit-history reads while reusing the existing audited correction mutation from #333 / PR #369.

## Academic-integrity invariants

- Finalized results remain locked against ordinary draft and criterion writes.
- Corrections use the existing `POST /api/student-portal/manage/results/correct` transaction.
- Every correction requires a non-empty reason and `expectedUpdatedAt` stale-write token.
- Original publication/finalization actor and timestamp provenance is preserved.
- Correction history remains append-only and staff-only.
- Student-facing result contracts are unchanged and do not expose correction reason/history/actor data.
- Whole-result correction does not rewrite finalized rubric criterion/CLO evidence.

## CI evidence required before merge

The repository CI must pass on the exact PR head:

- frozen dependency install and Prisma Client generation
- Prisma schema validation
- TypeScript typecheck
- lint
- full Bun tests and backend test discovery
- production build
- fresh PostgreSQL migration deployment and seed
- result correction database regression
- DB security verifier/probes
- backend authorization integration

No Prisma schema or migration change is expected for #382.
