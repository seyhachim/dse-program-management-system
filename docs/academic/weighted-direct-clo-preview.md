# Governance Phase 3C.2 — weighted direct CLO evidence (#1384)

Status: isolated candidate-only calculation foundation, stacked on #1385. Not a release or approved institutional calculation. Existing student portal and QA snapshot writer remain unchanged. Source RUPP-01, Chapter 12 pp. 49–52, Appendix D p. 94; restricted source metadata belongs in #1361. No private document, source links or student records are committed.

## Calculation and provenance

- Require an explicit CLO weight per relevant assessment from a reviewed plan, never infer a weight from the local course-grade field. Normalize one assessment's individually attributable direct scored components by earned points over planned maximum; then weight each assessment once, divided by the sum of weights for applicable direct assessments. Supporting-only and explicitly unmapped tasks do not contribute.
- A missing expected direct score, unresolved mapping or empty direct plan remains unknown; no partial classification, no automatic zero, no whole-assessment fallback. A genuine zero is valid evidence. Whole-assessment evidence is accepted only with an explicit exclusive CLO mapping. Shared group work is supporting evidence; separately attributable individual contribution may be direct.
- Each student has an exact expected assessment inventory; the roster is explicit. Match scope, enrollment, assessment, instrument identity/hash and exact paper assignment key. Accept only adapter-verified published and finalized records; reject wrong scope, stale identities, duplicates, invalid maxima/marks and direct score reuse. These are normalized inputs, not a replacement for the authoritative source service. Caller must verify the complete original instrument, membership, publication, finalization, correction, exact approved CourseSpec, relevant direct/supporting mapping and comparable paper design in the DB.
- Different papers are normalized per student, not pooled raw marks. Different direct assessment coverage prevents a candidate class level even when individual scores exist. This check does not establish paper equivalence; independent academic moderation remains required.
- Reuse #1385 candidate policy and population adapter. The measured-population rate is diagnostic, not official; a class level is withheld for incomplete population or unresolved/noncomparable assessment coverage. No exclusion rules invented. Scope, policy revision, assessment/row IDs, marks, weights, instrument versions, release-source revision and calculated values are retained in a deterministic hash-compatible preview payload aligned to #303. No persistence or overwrite. Raw numerical precision is retained subject to JavaScript floating point; institutional rounding and boundary semantics remain pending approval.
- No live calls, DB tables/migrations, routes, UI, student data, grades, report publication or snapshot writes. Do not pass request-supplied data into this internal function. Register binding does not establish academic approval. In future, authorized data-loading and DB integration must be verified before any runtime use.

## Existing integrations and release gates

Existing calculation paths: student-portal/assessment-calculation.ts, core/academic/marking-scheme-evidence.ts, qa/evidence/clo-attainment.ts and immutable QA snapshot model. Do not alter legacy mean aggregation or grade weight behavior here. Existing marking-scheme validation and exact-paper preview (#1383) must remain the canonical source validation path; the latter exposes draft diagnostics, not released evidence. This slice consumes a normalized released-evidence contract and has no runtime adapter to #1383 or group portfolio #1367. After the stacks land, implement reviewed source adapters and approved policy-to-offering binding; explicitly test release provenance, complete inventory, permissions and immutable snapshot append, without recalculating history. Coordinate #1355, #1371, #1367, #1277, #1281 and #1361. P0 activation blockers: QAC policy/rounding/denominator clarification, source eligibility and moderation, and integrated UAT. P1: adapter integration and cross-surface consistency. P2: dashboards and report presentation.

## Verification

Thirteen synthetic unit cases: Appendix D-shaped weighted regression (equivalent normalized ratios and weights; 86.875% before display rounding), unequal criterion maxima, evidence attribution, explicit weights, unresolved and missing results, zero and no evidence, exact-paper scope and release gates, variant normalization, unique evidence, exclusive CLO fallback guard, roster coverage, comparability and deterministic correction-sensitive hashing. No protected source excerpts. Run:

    bun run --cwd apps/backend test src/plugins/rubrics/weighted-direct-clo.test.ts
    bun run typecheck
    bun run lint
    bun run test:backend
    bun run test
    bun run build

Full CI, dependency synchronization, DB/security and review gates remain required. No production deployment.
