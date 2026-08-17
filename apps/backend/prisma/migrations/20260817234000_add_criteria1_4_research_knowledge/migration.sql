-- Issue #312: align Criteria 1 and 4 to the exact 10-expectation comparison set
-- used by the research evaluation. These are DSE-PMS research interpretations,
-- not duplicate AUN-QA requirements and not replacements for official guide text.
-- Existing product-facing operational expectations remain unchanged.

INSERT INTO "QaQualityExpectation" (
  "id", "requirementId", "statement", "purpose", "order", "active",
  "applicabilityRule", "scopeRequirement", "temporalRule", "relationshipRequirement"
) VALUES
-- Criterion 1: five research expectations.
(
  'aun-qa-v4:1.1:research:c1-e01',
  'aun-qa-programme-v4:1.1',
  'Current programme learning outcomes are formally defined in an authoritative programme record.',
  'Establish a stable current PLO baseline before testing curriculum mapping, consistency, or revision traceability.',
  2, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[]}'::jsonb
),
(
  'aun-qa-v4:1.2:research:c1-e02',
  'aun-qa-programme-v4:1.2',
  'Active course learning outcomes are explicitly linked to programme learning outcomes.',
  'Make course-to-programme outcome alignment directly traceable through active approved CourseSpec versions.',
  2, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme","course","courseSpecVersion"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[]}'::jsonb
),
(
  'aun-qa-v4:1.2:research:c1-e03',
  'aun-qa-programme-v4:1.2',
  'Programme learning outcomes have curriculum coverage through active courses and course learning outcomes.',
  'Distinguish isolated CLO-to-PLO links from programme-wide curriculum coverage of the defined PLO set.',
  3, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[{"fromEvidenceType":"course-clo-plo-coverage","toEvidenceType":"programme-outcomes","relation":"supports"}]}'::jsonb
),
(
  'aun-qa-v4:1.1:research:c1-e04',
  'aun-qa-programme-v4:1.1',
  'Authoritative learning-outcome records are internally consistent across programme and approved course records.',
  'Surface conflicting or stale outcome identities rather than treating independently present records as automatically consistent.',
  3, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[{"fromEvidenceType":"clo-plo-mappings","toEvidenceType":"programme-outcomes","relation":"supports"}]}'::jsonb
),
(
  'aun-qa-v4:1.1:research:c1-e05',
  'aun-qa-programme-v4:1.1',
  'Changes to learning outcomes are traceable to revision and approval evidence.',
  'Require learning-outcome changes to retain an auditable governance trail rather than relying only on the latest current value.',
  4, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[{"fromEvidenceType":"learning-outcome-revision-history","toEvidenceType":"approval-history","relation":"supports"}]}'::jsonb
),
-- Criterion 4: five research expectations.
(
  'aun-qa-v4:4.1:research:c4-e01',
  'aun-qa-programme-v4:4.1',
  'Assessment components are explicitly defined for the applicable approved course specification.',
  'Establish the exact assessment structure before testing alignment, rubric linkage, results, or attainment.',
  2, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme","course","courseSpecVersion"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[]}'::jsonb
),
(
  'aun-qa-v4:4.1:research:c4-e02',
  'aun-qa-programme-v4:4.1',
  'Assessment components are explicitly linked to the course learning outcomes they are intended to measure.',
  'Make assessment-to-CLO alignment machine-testable within the exact CourseSpec version.',
  3, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[{"fromEvidenceType":"clo-assessment-alignment","toEvidenceType":"assessment-plan","relation":"supports"}]}'::jsonb
),
(
  'aun-qa-v4:4.4:research:c4-e03',
  'aun-qa-programme-v4:4.4',
  'Applicable assessments have an explicitly linked rubric or assessment criteria version.',
  'Prevent unrelated rubric-library entries from being treated as evidence for a specific assessment.',
  1, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,
  '{"kind":"pointInTime"}'::jsonb,
  '{"requiredLinks":[{"fromEvidenceType":"rubrics","toEvidenceType":"assessment-plan","relation":"supports"}]}'::jsonb
),
(
  'aun-qa-v4:4.5:research:c4-e04',
  'aun-qa-programme-v4:4.5',
  'Published student results are traceable to the exact assessment components that produced them.',
  'Preserve assessment/result provenance so a later CourseSpec or assessment change cannot reinterpret historical results.',
  2, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme","course","courseSpecVersion","offering","assessment","population"]}'::jsonb,
  '{"kind":"withinCycle"}'::jsonb,
  '{"requiredLinks":[{"fromEvidenceType":"published-results","toEvidenceType":"assessment-plan","relation":"derivedFrom"}]}'::jsonb
),
(
  'aun-qa-v4:4.5:research:c4-e05',
  'aun-qa-programme-v4:4.5',
  'CLO attainment is reproducibly derived from exact mapped assessment and published-result evidence.',
  'Require attainment to cite exact source mappings/results, threshold rules, population, and calculation version rather than an unstable aggregate.',
  3, true,
  '{"kind":"always"}'::jsonb,
  '{"requiredDimensions":["programme","course","courseSpecVersion","offering","population"]}'::jsonb,
  '{"kind":"withinCycle"}'::jsonb,
  '{"requiredLinks":[{"fromEvidenceType":"clo-attainment-snapshots","toEvidenceType":"published-results","relation":"derivedFrom"},{"fromEvidenceType":"clo-attainment-snapshots","toEvidenceType":"clo-assessment-alignment","relation":"derivedFrom"}]}'::jsonb
);

INSERT INTO "QaExpectedEvidence" (
  "id", "expectationId", "evidenceType", "description", "role", "sourceDomain", "order",
  "scopeRequirement", "temporalRule", "authorityRequirement"
) VALUES
-- C1-E01
('aun-qa-v4:1.1:research:c1-e01:evidence:1','aun-qa-v4:1.1:research:c1-e01','programme-outcomes','Current PLO identities, codes, descriptions and active status from the programme outcome source of truth.','required','outcomes',1,'{"requiredDimensions":["programme"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"controlledInternalRecord"}'::jsonb),
('aun-qa-v4:1.1:research:c1-e01:evidence:2','aun-qa-v4:1.1:research:c1-e01','published-outcomes','Approved/published programme documentation that identifies the current PLO set.','supportive','document',2,'{"requiredDimensions":["programme"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"uploadedExternalDocument"}'::jsonb),
-- C1-E02
('aun-qa-v4:1.2:research:c1-e02:evidence:1','aun-qa-v4:1.2:research:c1-e02','clo-plo-mappings','Active CLO-to-PLO mappings from the exact approved CourseSpec version.','required','courseSpec',1,'{"requiredDimensions":["programme","course","courseSpecVersion"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
-- C1-E03
('aun-qa-v4:1.2:research:c1-e03:evidence:1','aun-qa-v4:1.2:research:c1-e03','programme-outcomes','The current PLO set whose programme-wide curriculum coverage must be established.','required','outcomes',1,'{"requiredDimensions":["programme"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"controlledInternalRecord"}'::jsonb),
('aun-qa-v4:1.2:research:c1-e03:evidence:2','aun-qa-v4:1.2:research:c1-e03','course-clo-plo-coverage','Course/CLO coverage records showing where each PLO is supported across active approved CourseSpecs.','required','courseSpec',2,'{"requiredDimensions":["programme","course","courseSpecVersion"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
-- C1-E04
('aun-qa-v4:1.1:research:c1-e04:evidence:1','aun-qa-v4:1.1:research:c1-e04','programme-outcomes','Authoritative current PLO records used as the consistency baseline.','required','outcomes',1,'{"requiredDimensions":["programme"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"controlledInternalRecord"}'::jsonb),
('aun-qa-v4:1.1:research:c1-e04:evidence:2','aun-qa-v4:1.1:research:c1-e04','clo-plo-mappings','Approved CourseSpec mappings whose referenced PLO identities must resolve to the authoritative programme outcome set.','required','courseSpec',2,'{"requiredDimensions":["programme","course","courseSpecVersion"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
-- C1-E05
('aun-qa-v4:1.1:research:c1-e05:evidence:1','aun-qa-v4:1.1:research:c1-e05','learning-outcome-revision-history','Versioned revision/change evidence identifying what learning outcomes changed and why.','required','outcomes',1,'{"requiredDimensions":["programme"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"controlledInternalRecord"}'::jsonb),
('aun-qa-v4:1.1:research:c1-e05:evidence:2','aun-qa-v4:1.1:research:c1-e05','approval-history','Approval/review evidence explicitly associated with the learning-outcome revision.','required','courseSpec',2,'{"requiredDimensions":["programme","course"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
-- C4-E01
('aun-qa-v4:4.1:research:c4-e01:evidence:1','aun-qa-v4:4.1:research:c4-e01','assessment-plan','Active assessment components with stable identities, method/title, weight/max-score context, and exact CourseSpec version.','required','assessment',1,'{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
-- C4-E02
('aun-qa-v4:4.1:research:c4-e02:evidence:1','aun-qa-v4:4.1:research:c4-e02','assessment-plan','Exact assessment components in the approved CourseSpec version.','required','assessment',1,'{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
('aun-qa-v4:4.1:research:c4-e02:evidence:2','aun-qa-v4:4.1:research:c4-e02','clo-assessment-alignment','Explicit assessment-to-CLO mappings for the same CourseSpec and assessment identity.','required','assessment',2,'{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
-- C4-E03
('aun-qa-v4:4.4:research:c4-e03:evidence:1','aun-qa-v4:4.4:research:c4-e03','assessment-plan','The exact in-scope assessment whose rubric applicability is being tested.','required','assessment',1,'{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
('aun-qa-v4:4.4:research:c4-e03:evidence:2','aun-qa-v4:4.4:research:c4-e03','rubrics','The exact linked rubric/version or assessment criteria for the in-scope assessment.','required','assessment',2,'{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
-- C4-E04
('aun-qa-v4:4.5:research:c4-e04:evidence:1','aun-qa-v4:4.5:research:c4-e04','assessment-plan','Exact assessment component definition from the bound approved CourseSpec version.','required','assessment',1,'{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
('aun-qa-v4:4.5:research:c4-e04:evidence:2','aun-qa-v4:4.5:research:c4-e04','published-results','Published result records carrying exact assessment/CourseSpec/offering provenance for the in-scope population.','required','assessment',2,'{"requiredDimensions":["programme","course","courseSpecVersion","offering","assessment","population"]}'::jsonb,'{"kind":"withinCycle"}'::jsonb,'{"minimumAuthority":"controlledInternalRecord"}'::jsonb),
-- C4-E05
('aun-qa-v4:4.5:research:c4-e05:evidence:1','aun-qa-v4:4.5:research:c4-e05','published-results','Published result evidence used as the exact attainment calculation input.','required','assessment',1,'{"requiredDimensions":["programme","course","courseSpecVersion","offering","assessment","population"]}'::jsonb,'{"kind":"withinCycle"}'::jsonb,'{"minimumAuthority":"controlledInternalRecord"}'::jsonb),
('aun-qa-v4:4.5:research:c4-e05:evidence:2','aun-qa-v4:4.5:research:c4-e05','clo-assessment-alignment','The exact CLO-to-assessment mappings that determine which result evidence contributes to each CLO.','required','assessment',2,'{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb,'{"kind":"pointInTime"}'::jsonb,'{"minimumAuthority":"approvedDocument"}'::jsonb),
('aun-qa-v4:4.5:research:c4-e05:evidence:3','aun-qa-v4:4.5:research:c4-e05','clo-attainment-snapshots','Versioned attainment snapshot with threshold/rule, population, source identifiers, calculation version and reproducible lineage.','required','assessment',3,'{"requiredDimensions":["programme","course","courseSpecVersion","offering","population"]}'::jsonb,'{"kind":"withinCycle"}'::jsonb,'{"minimumAuthority":"controlledInternalRecord"}'::jsonb);
