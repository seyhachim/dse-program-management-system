# Multi-variant examination domain foundation — #1371

Parent work item #1355; academic pilot #1281; foundation #1356.

## Phase 1 contract

One CourseSpec assessment and one existing grade weight. Each confirmed enrollment assignment identifies a single exact paper revision by variant ID + hash. A section permission must refer to that same revision. Unknown/unconfirmed or stale assignments fail closed; there is no latest/default fallback. A catalog can retain multiple immutable revisions; duplicate revisions are rejected.

The pure server-side module `apps/backend/src/core/academic/exam-variant.ts` validates strict metadata and question contracts. Its canonical SHA-256 snapshot covers programme/spec/assessment, variant/revision, existing marking scheme ID/hash, total maximum, ordered question IDs/maxima, CLOs and direct/supporting evidence roles. Snapshot and nested questions are frozen; serialized snapshots are revalidated on resolution. This hash is not an approval signature. The future persistence integration must independently verify the original instrument content hash, exact version, approved mapping, trusted assignment, actor authorization and allowed offering membership.

All variants in a single examination must have the same authorized raw maximum. The score envelope binds programme, spec, assessment, offering, enrollment and variant hash. Question maxima must match the frozen definition. Duplicate/unknown questions, nonfinite/negative/out-of-range marks and wrong context/version fail closed. Explicit null/omitted marks remain missing; zero is an actual mark. No partial derived total or evidence. Complete scores aggregate separately per CLO and evidence role using only that student's assigned paper. Direct and supporting outputs are distinct; callers must not pool them into direct attainment. No grade weight is accepted in the domain contract. The historical total guard checks agreement against actual complete itemized evidence, never reconstructs missing marks.

No real paper content, marking keys, student records or source URLs are included. The five-variant regression is synthetic; it does not approve TSA301 mapping, marking rules or weights. M1 missing original scoring rules, actual paper allocations and moderated CLO mappings remain academic gates.

## Scope and sequencing

- Phase 1: new backend domain module, synthetic Bun tests and this document only. No production path imports the module, no shared barrel exports, no Prisma changes, no API/UI changes. Existing single-scheme and rubric flows remain untouched.
- Phase 2: additive immutable variant definitions/permissions/assignments and append-only assignment events; composite scope FKs, unique enrollment/assessment assignment, private access, transactional locks and exact approved instrument verification. Unknown actual paper stays unresolved. No automatic historical backfill.
- Phase 3: integrate exact assignment and snapshot with existing result entry, correction/publication/finalization and shared student/QA CLO evidence. Keep one assessment result per enrollment. Do not permit ordinary variant reassignment after scores exist. Preserve original result IDs and historical snapshots; version any new attainment calculation. Preserve legacy total-only records without claiming itemized evidence.
- Phase 4: lecturer-only variant authoring/assignment/markbook, neutral question identifiers; no answer keys in DTOs/logs/exports. Independent approval and genuine paper assignment evidence before pilot.
- Before integration coordinate shared files with #1365 (results lifecycle), #1280/#1354 (CourseSpec), #1367 (QA evidence), #1362 (instruments/policy), #1277 (release) and #1352 (group assessment). No duplicate grade engine.

## Verification

From repository root, use pinned Bun and installed workspace dependencies:

```sh
bun install --frozen-lockfile
bun test apps/backend/src/core/academic/exam-variant.test.ts
bunx prisma validate --schema apps/backend/prisma/schema.prisma
bun run typecheck
bun run lint
bun run test
bun run test:backend
bun run build
```

Full exact-head CI and independent review required before merge. Phase 1 is domain-only: no live grading, database writes, migration or deployments. Future integration must additionally pass populated isolated database and authenticated browser acceptance, including concurrent assignments, wrong-section and wrong-paper denial, score preservation, publication/correction locking, private evidence and unchanged historical totals.
