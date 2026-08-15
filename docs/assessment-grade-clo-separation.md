# Assessment grade vs CLO evidence domain audit

Parent epic: #255

This document records the implementation decision for #256 and the foundation for #257–#259.

## Current domain

The repository already has most of the required domain boundaries. The implementation should extend them rather than introduce parallel assessment/result models.

### Course specification assessment definition

`apps/backend/prisma/schema.prisma`

- `CourseSpecAssessmentItem.weight` is the local course-grading percentage/weight.
- `CourseSpecAssessmentItem.cloCodes` is an explicit assessment-to-CLO alignment declared in the course specification.
- `CourseSpecAssessmentItem.rubricId` links a course assessment to a reusable rubric.
- `CourseSpecClo` is version-scoped under `CourseSpec`; CLO display codes such as `CLO1` are derived from row order.
- `CourseSpecMappingCell` is a normalized course-spec alignment table for weekly-plan/assessment references and CLO codes, including mapping strength.

### Student results

`apps/backend/prisma/schema.prisma`

- `Enrollment` is the student/offering authorization boundary.
- `AssessmentResult` stores one student's score/maxScore/feedback for one assessment item in one exact `courseSpecId`.
- The unique key `(enrollmentId, courseSpecId, assessmentItemId)` already preserves result identity against the exact course-spec version.
- Result publication is explicit through `AssessmentResult.publishedAt`.

### CLO achievement calculation

`apps/backend/src/plugins/student-portal/service.ts`

Before #257, `calculateCloAchievements()` selected published results only for assessments whose `cloCodes` explicitly included the CLO, but then reused `CourseSpecAssessmentItem.weight` as the weighting factor for CLO achievement.

That coupling is academically unsafe because `weight` is a local course-grade weight. A grade-only component such as Attendance & Participation can legitimately affect the final course grade without being evidence of CLO achievement.

### Existing tests

`apps/backend/src/plugins/student-portal/achievement.test.ts`

The previous regression test explicitly expected local course-grade weights to weight CLO evidence. #257 changes this expectation so CLO evidence aggregation no longer reuses grade weights.

### Assessment save path

`apps/backend/src/plugins/courses/service.ts`

`syncAssessmentPlan()` persists `CourseSpecAssessmentItem` rows and their `cloCodes`, but currently treats CLO codes as loose references. Rubric ids are reconciled against real rubric rows before write. Assessment-to-CLO validation should be strengthened without changing the meaning of `weight`.

### Rubric domain

`Rubric`, `RubricCriterion`, `RubricLevel`, and `RubricCell` are normalized in Prisma. However, the current student result model stores only an assessment-level score/maxScore; it does not yet persist criterion-level student scores. Therefore criterion-level CLO evidence can be represented/configured in a later schema slice, but it cannot produce criterion-level student CLO achievement until criterion scoring is also introduced.

## Target boundary

### Local course grade

Local course grading uses assessment score plus the assessment's local `weight`.

`weight` must continue to mean only course-grade contribution. It must never be renamed, copied, or interpreted as an AUN-QA/CLO evidence weight.

A component with a positive/local grade weight may have no CLO mapping. Attendance & Participation is the canonical example.

### CLO achievement

CLO achievement uses only explicit assessment evidence mappings (`cloCodes` in the current model, with future normalized/criterion-level mappings as the model evolves).

An assessment with no CLO mapping contributes no CLO evidence, regardless of its local course-grade weight.

Until an explicit CLO aggregation policy exists, multiple mapped assessment results are aggregated equally. This avoids silently repurposing local grade weights as outcome-evidence weights.

### AUN-QA presentation

AUN-QA/course-spec reporting may display local course grading percentages when they are part of the approved course assessment policy, but they must be labeled as course grading weights. CLO alignment is a separate mapping. There is no `AUN grade weight` field.

## Schema decision for #259

No new parallel `StudentCourseResult`, assessment-component, or duplicated student-result tables should be introduced in #259.

The existing schema already preserves:

- exact course-spec version (`AssessmentResult.courseSpecId`),
- assessment identity (`assessmentItemId`),
- local grade weight (`CourseSpecAssessmentItem.weight`),
- explicit assessment CLO alignment (`cloCodes`), and
- published student scores (`AssessmentResult`).

Therefore the first compatibility migration should be **schema-neutral unless #258 identifies an integrity constraint that cannot be enforced in service code**. In particular, do not fabricate normalized CLO evidence rows or infer mappings from `weight` during migration.

Criterion-level CLO mapping should be added only together with a clear criterion-score/result model so the schema does not create evidence configuration that cannot be evaluated for students.

## Historical/versioning safety

Assessment definitions are children of `CourseSpec`. Student results store the exact `courseSpecId`, so later academic course-spec revisions do not need to reinterpret historical results against new assessment definitions.

Any future normalized evidence mapping must also be scoped by `courseSpecId` and must not bind historical results to the latest course specification implicitly.

## Implementation rules

1. `CourseSpecAssessmentItem.weight` remains local course-grade weight only.
2. `calculateCloAchievements()` must not use local grade weight as CLO evidence weight.
3. An assessment contributes to a CLO only when explicitly mapped to that CLO.
4. Grade-only attendance/participation must be valid and contribute zero CLO evidence by default.
5. Invalid assessment-to-CLO references should be rejected at the course-spec save boundary.
6. Do not create an `AUN grade weight` field.
7. Do not fabricate mappings during migration.
8. Preserve exact course-spec version identity for all results/evidence.
9. Criterion-level evidence mapping waits for criterion-level student scoring unless both are introduced together.

## Follow-up ownership

- #257 fixes calculation separation and its regression coverage.
- #258 tightens explicit assessment/CLO mapping validation; criterion-level mapping must remain coupled to criterion-level result support.
- #259 performs only migration work proven necessary by the audit; it must not add duplicate result models or reinterpret existing weights.
