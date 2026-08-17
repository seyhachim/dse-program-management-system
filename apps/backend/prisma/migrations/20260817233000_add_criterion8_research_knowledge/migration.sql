-- Issue #300: install the first machine-operable Criterion 8 research knowledge slice.
-- Operational interpretations are deliberately separate from the official AUN-QA guide text.
-- This migration adds knowledge only; it does not create or infer operational student outcome records.

ALTER TABLE "QaQualityExpectation"
  ADD COLUMN "relationshipRequirement" JSONB NOT NULL
  DEFAULT '{"requiredLinks":[]}'::jsonb;

-- C8-E01 / C8-E02 map to AUN-QA v4 requirement 8.1 because they concern
-- progression/completion outcomes. C8-E03 / C8-E04 map to 8.4 because they
-- concern measured learning-outcome achievement. C8-E05 maps to 8.5 as the
-- research slice concerned with monitoring, review and follow-up of outcome concerns.
INSERT INTO "QaQualityExpectation" (
  "id", "requirementId", "statement", "purpose", "order", "active",
  "applicabilityRule", "scopeRequirement", "temporalRule", "relationshipRequirement"
) VALUES
(
  'aun-qa-v4:8.1:research:c8-e01',
  'aun-qa-programme-v4:8.1',
  'Student progression is systematically recorded across comparable academic periods.',
  'Establish an authoritative, reconstructable progression history without inferring progression from attendance or ad-hoc enrolment queries.',
  1,
  true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme","cohort"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[]}'::jsonb
),
(
  'aun-qa-v4:8.1:research:c8-e02',
  'aun-qa-programme-v4:8.1',
  'Completion and graduation outcomes are available for cohorts that have reached programme maturity.',
  'Prevent immature cohorts from being mislabeled as evidence gaps while making mature-cohort completion evidence traceable.',
  2,
  true,
  '{"kind":"cohortMaturity","minimumElapsedYears":4}'::jsonb,
  '{"requiredDimensions":["programme","cohort"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[]}'::jsonb
),
(
  'aun-qa-v4:8.4:research:c8-e03',
  'aun-qa-programme-v4:8.4',
  'Learning-outcome achievement is measured from reproducible assessment evidence.',
  'Require outcome-achievement evidence to be reproducible from exact assessment mappings and result inputs instead of unstable on-demand aggregates.',
  1,
  true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[]}'::jsonb
),
(
  'aun-qa-v4:8.4:research:c8-e04',
  'aun-qa-programme-v4:8.4',
  'Programme outcome indicators are monitored longitudinally using comparable definitions.',
  'Distinguish isolated outcome measurements from sufficient longitudinal evidence and make definition changes visible.',
  2,
  true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[]}'::jsonb
),
(
  'aun-qa-v4:8.5:research:c8-e05',
  'aun-qa-programme-v4:8.5',
  'Outcome concerns are traceable to review, improvement action, and follow-up evidence.',
  'Represent continuous improvement as an explicit evidence chain without inventing causal links merely because related records exist.',
  1,
  true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[{"fromEvidenceType":"outcome-concerns","toEvidenceType":"qa-review-records","relation":"reviewedBy"},{"fromEvidenceType":"qa-review-records","toEvidenceType":"improvement-actions","relation":"resultsIn"},{"fromEvidenceType":"improvement-actions","toEvidenceType":"follow-up-evidence","relation":"followedUpBy"}]}'::jsonb
);

INSERT INTO "QaExpectedEvidence" (
  "id", "expectationId", "evidenceType", "description", "role", "sourceDomain", "order",
  "scopeRequirement", "temporalRule", "authorityRequirement"
) VALUES
-- C8-E01: authoritative cohort membership plus multi-period progression records.
(
  'aun-qa-v4:8.1:research:c8-e01:evidence:1',
  'aun-qa-v4:8.1:research:c8-e01',
  'cohort-membership',
  'Authoritative programme cohort membership with join/exit context.',
  'required', 'outcomes', 1,
  '{"requiredDimensions":["programme","cohort"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"minimumAuthority":"officialInstitutionalRecord"}'::jsonb
),
(
  'aun-qa-v4:8.1:research:c8-e01:evidence:2',
  'aun-qa-v4:8.1:research:c8-e01',
  'student-progression-records',
  'Student progression status recorded for comparable academic periods within a cohort.',
  'required', 'outcomes', 2,
  '{"requiredDimensions":["programme","cohort","academicYear"]}'::jsonb,
  '{"kind":"multiPeriod","minimumPeriods":2}'::jsonb,
  '{"minimumAuthority":"officialInstitutionalRecord"}'::jsonb
),
-- C8-E02: maturity-aware completion/graduation evidence.
(
  'aun-qa-v4:8.1:research:c8-e02:evidence:1',
  'aun-qa-v4:8.1:research:c8-e02',
  'completion-records',
  'Authoritative completion status and completion date for members of a mature cohort.',
  'required', 'outcomes', 1,
  '{"requiredDimensions":["programme","cohort","population"]}'::jsonb,
  '{"kind":"withinCycle"}'::jsonb,
  '{"minimumAuthority":"officialInstitutionalRecord"}'::jsonb
),
(
  'aun-qa-v4:8.1:research:c8-e02:evidence:2',
  'aun-qa-v4:8.1:research:c8-e02',
  'graduation-outcomes',
  'Graduation or award outcomes derived from authoritative programme records for the mature cohort.',
  'supportive', 'outcomes', 2,
  '{"requiredDimensions":["programme","cohort","population"]}'::jsonb,
  '{"kind":"withinCycle"}'::jsonb,
  '{"minimumAuthority":"officialInstitutionalRecord"}'::jsonb
),
-- C8-E03: reproducible learning-outcome achievement snapshots.
(
  'aun-qa-v4:8.4:research:c8-e03:evidence:1',
  'aun-qa-v4:8.4:research:c8-e03',
  'clo-attainment-snapshots',
  'Versioned CLO-attainment snapshots tied to exact CourseSpec, offering, assessment mappings, result inputs, threshold and calculation version.',
  'required', 'assessment', 1,
  '{"requiredDimensions":["programme","course","courseSpecVersion","offering","population"]}'::jsonb,
  '{"kind":"withinCycle"}'::jsonb,
  '{"minimumAuthority":"controlledInternalRecord"}'::jsonb
),
(
  'aun-qa-v4:8.4:research:c8-e03:evidence:2',
  'aun-qa-v4:8.4:research:c8-e03',
  'programme-outcome-achievement',
  'Programme-level synthesis of learning-outcome achievement with traceable source snapshots and calculation version.',
  'supportive', 'outcomes', 2,
  '{"requiredDimensions":["programme","cohort"]}'::jsonb,
  '{"kind":"withinCycle"}'::jsonb,
  '{"minimumAuthority":"derivedAnalysis"}'::jsonb
),
-- C8-E04: longitudinal outcome indicators with stable definitions.
(
  'aun-qa-v4:8.4:research:c8-e04:evidence:1',
  'aun-qa-v4:8.4:research:c8-e04',
  'programme-outcome-indicators',
  'Versioned programme outcome indicators with period/cohort, numerator, denominator, value, definition version and source lineage.',
  'required', 'outcomes', 1,
  '{"requiredDimensions":["programme","cohort","academicYear"]}'::jsonb,
  '{"kind":"longitudinal","minimumPeriods":3}'::jsonb,
  '{"minimumAuthority":"controlledInternalRecord"}'::jsonb
),
(
  'aun-qa-v4:8.4:research:c8-e04:evidence:2',
  'aun-qa-v4:8.4:research:c8-e04',
  'indicator-definition-history',
  'Traceable indicator definition/calculation versions showing when measures changed and whether periods remain comparable.',
  'supportive', 'outcomes', 2,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"minimumAuthority":"controlledInternalRecord"}'::jsonb
),
-- C8-E05: explicit finding -> review -> action -> follow-up chain.
(
  'aun-qa-v4:8.5:research:c8-e05:evidence:1',
  'aun-qa-v4:8.5:research:c8-e05',
  'outcome-concerns',
  'Structured QA finding or outcome concern tied to the outcome evidence that motivated review.',
  'required', 'outcomes', 1,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"minimumAuthority":"controlledInternalRecord"}'::jsonb
),
(
  'aun-qa-v4:8.5:research:c8-e05:evidence:2',
  'aun-qa-v4:8.5:research:c8-e05',
  'qa-review-records',
  'Review or decision record explicitly linked to the identified outcome concern.',
  'required', 'outcomes', 2,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"minimumAuthority":"controlledInternalRecord"}'::jsonb
),
(
  'aun-qa-v4:8.5:research:c8-e05:evidence:3',
  'aun-qa-v4:8.5:research:c8-e05',
  'improvement-actions',
  'Improvement action with owner/status/due context explicitly linked to the review decision.',
  'required', 'outcomes', 3,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"minimumAuthority":"controlledInternalRecord"}'::jsonb
),
(
  'aun-qa-v4:8.5:research:c8-e05:evidence:4',
  'aun-qa-v4:8.5:research:c8-e05',
  'follow-up-evidence',
  'Follow-up evidence explicitly linked to the improvement action so closure/effectiveness is not inferred from unrelated records.',
  'required', 'outcomes', 4,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"minimumAuthority":"controlledInternalRecord"}'::jsonb
);
