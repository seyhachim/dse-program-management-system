# Governance Phase 3C.1 — CLO attainment policy foundation (#1384)

Status: candidate-only, not institutional approval or a runtime capability. Parent dependency: #1361 / PR #1362; existing snapshot infrastructure: #303. This slice is separate from the exam-variant phase bearing a similar number (#1371 / PR #1383).

## Authority and open decisions

Restricted source RUPP-01: Chapter 12 pp. 49–52, section 15.2 p. 61, Appendix D pp. 94–95. Bibliographic locators only; enter the exact verified institutional revision through the authorized policy register. No private source links, source document or excerpts in Git. The two candidate band sets are distinct technical proposals pending authorized applicability review. The worked example is not consistently compatible with either set. Obtain written QAC clarification about band selection, individual criterion, course targets, denominator/exclusions, rounding and the direct/indirect combination before activation; do not interpret CI as academic approval.

## Scope and integration boundary

- The isolated domain module uses the existing register's programme access check and references an exact verified OBE revision by ID/revision number. This is a candidate preview binding, not an approved calculation policy. Future server code must load that revision from the protected register and validate its current applicability; never accept client-supplied register records.
- Candidate configuration and preview version are immutable in memory; both candidate bands remain non-activatable. No API, UI, persistent policy model, seed or configuration switch. Future policy persistence/approval and offering binding require a separate reviewed change.
- Existing immutable snapshot counts can be inspected for coverage; they may reflect legacy rules, so they are NOT evidence under the proposed threshold. No recalculation or replacement of snapshots. Empty/incomplete populations do not yield a complete-population rate; the measured rate is diagnostic only, not an approved denominator.
- Missing direct or indirect evidence stays unknown; no reweighting or zero imputation. Direct class level, indirect score and overall target status remain distinct from rubric levels and course grades. No claim of complete coverage based on counts alone.
- Next 3C.2: resolve exact approved offering/specification and assessment version, direct versus supporting attribution, criterion/question weight aggregation, full expected evidence and group/individual evidence, then canonical weighted score generation. Reuse existing QA snapshot writer only in a future approved version. Coordinate exam PRs #1372–#1377, #1379, #1383 and QA evidence PR #1367. Later phases cover exit surveys, overall reporting, PLO/CQI and TSA301 #1281.

## Verification

Synthetic fixtures exercise both band boundaries, individual threshold, normalization, weighted combination, examples shaped by Appendix D, missing/zero semantics, invalid counts, scoped permission and immutable candidate reference. Divergent results are intentional; no attempt to reproduce inconsistent source labels as expected policy. No student data. Run from repository root:

    bun run --cwd apps/backend test src/plugins/rubrics/clo-attainment-policy.test.ts
    bun run typecheck
    bun run lint
    bun run test:backend
    bun run test
    bun run build

CI and review remain required. No production changes or deployment. Stack must be synchronized with current main and pass governance and dependency review before merge.
