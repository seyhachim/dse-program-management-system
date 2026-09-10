# University Policy — Year 1 (FDY 2025)

## Scope

- **Authority:** University
- **Applies to:** Foundation / Programme Year 1 only
- **Source:** `បទបញ្ញត្តិ FDY 2025.pdf` (4-page user-supplied university policy)
- **Policy code used by PMS:** `FDY-2025`
- **Implementation issue:** #994

This document is a PMS implementation note, not a replacement for the signed university policy. When a procedural consequence is ambiguous, staff must consult the source policy instead of allowing the software to invent a rule.

## Rule hierarchy

For Year 1:

> University / FDY policy → DSE procedure → PMS implementation

For Years 2–4, FDY 2025 is not applicable. Their rules must come from the separately applicable university, faculty, programme, or course policies.

## Machine-readable rules implemented in phase 1

### Grading — source page 2

| Score | Grade | Grade point |
| ---: | :---: | ---: |
| 85–100 | A | 4.00 |
| 80–84 | B+ | 3.50 |
| 70–79 | B | 3.00 |
| 65–69 | C+ | 2.50 |
| 50–64 | C | 2.00 |
| 45–49 | D | 1.50 |
| 40–44 | E | 1.00 |
| <40 | F | 0.00 |

PMS uses normalized percentage intervals for calculation: for example, the published display band `80–84` is represented as `[80, 85)`, while `85–100` includes 100.

**Important:** this Year 1 university scale is different from the existing DSE programme grading scale. Phase 1 does not replace or rewrite the programme scale used outside the Year 1 FDY scope.

### Assessment composition — source page 1

- Continuous / in-class assessment: **60%**
- Semester examination: **40%**

For Year 1, PMS may validate the composition and explain any mismatch. The current Course Specification model does not yet have a sufficiently explicit university-policy category for distinguishing all continuous items from the semester examination, so the pure evaluator accepts the two totals explicitly rather than guessing from assessment names or types.

### Attendance — source page 1

| Funding category | Minimum attendance | Max excused absence | Max unexcused absence |
| --- | ---: | ---: | ---: |
| Scholarship | 80% | 20% | 15% |
| Fee-paying | 70% | 30% | 20% |

If a Year 1 student's funding category is unknown, PMS must return **REVIEW_REQUIRED** rather than infer a category.

Phase 1 evaluates compliance with the percentages only. It does **not** automatically mark a student exam-ineligible, suspend a student, or apply another academic sanction. Those consequences require clause-by-clause verification of the source wording and the responsible approval authority.

## PMS decision statuses

- `COMPLIANT` — supplied Year 1 values satisfy the machine-readable threshold(s).
- `NON_COMPLIANT` — one or more machine-readable threshold(s) are exceeded or unmet.
- `REVIEW_REQUIRED` — the rule applies but required classification/context is missing.
- `NOT_APPLICABLE` — the student/course is not Programme Year 1.

Every future UI/API decision should retain `policyCode = FDY-2025` and a source page so staff and students can understand why PMS produced the result.

## Requirements matrix

| Policy area | PMS phase-1 behaviour | Automation boundary |
| --- | --- | --- |
| Scope | Apply only when authoritative programme year = 1 | Automatic |
| Grading | Calculate the FDY grade/point from final percentage | Automatic |
| Assessment weighting | Validate 60% continuous + 40% semester exam | Automatic validation |
| Scholarship attendance | Evaluate 80 / 20 / 15 thresholds | Automatic compliance check |
| Fee-paying attendance | Evaluate 70 / 30 / 20 thresholds | Automatic compliance check |
| Missing funding category | Return `REVIEW_REQUIRED` | No guessing |
| Exam eligibility | Not decided from attendance in phase 1 | Human/policy verification required |
| Retake/progression | Defer until exact procedural clauses are transcribed | Future workflow |
| Conduct/discipline | Record evidence/decisions only; never auto-punish | Future human-approved workflow |

## Follow-up before phase 2 automation

The policy also contains examination/result, continuation/progression, conduct, and disciplinary provisions. Before those become executable PMS rules, transcribe the relevant Khmer clauses with page/article provenance and verify the responsible authority and consequence for each condition.
