-- Issue #185: framework-level QA quality expectations and expected evidence.
-- Additive only. Operational evidence remains programme/cycle scoped in QaEvidence.

CREATE TABLE "QaQualityExpectation" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaQualityExpectation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaExpectedEvidence" (
    "id" TEXT NOT NULL,
    "expectationId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaExpectedEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QaExpectedEvidence_role_check" CHECK ("role" IN ('required', 'supportive', 'contextual')),
    CONSTRAINT "QaExpectedEvidence_source_domain_check" CHECK ("sourceDomain" IN ('programme','outcomes','courseSpec','teachingLearning','weeklyPlan','assessment','staff','offering','document','survey','minutes','policy'))
);

CREATE UNIQUE INDEX "QaQualityExpectation_requirementId_order_key"
    ON "QaQualityExpectation"("requirementId", "order");
CREATE INDEX "QaQualityExpectation_requirementId_active_idx"
    ON "QaQualityExpectation"("requirementId", "active");
CREATE UNIQUE INDEX "QaExpectedEvidence_expectationId_order_key"
    ON "QaExpectedEvidence"("expectationId", "order");
CREATE INDEX "QaExpectedEvidence_sourceDomain_idx"
    ON "QaExpectedEvidence"("sourceDomain");

ALTER TABLE "QaQualityExpectation" ADD CONSTRAINT "QaQualityExpectation_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaExpectedEvidence" ADD CONSTRAINT "QaExpectedEvidence_expectationId_fkey"
    FOREIGN KEY ("expectationId") REFERENCES "QaQualityExpectation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pilot knowledge for selected Criteria 1-5 requirements. The statements below
-- are operational summaries, not copies of the official AUN-QA requirement text.
INSERT INTO "QaQualityExpectation" ("id", "requirementId", "statement", "purpose", "order") VALUES
('aun-qa-v4:1.1:expectation:1','aun-qa-programme-v4:1.1','Programme learning outcomes are explicitly formulated, aligned with institutional direction, and communicated to relevant stakeholders.','Establish that programme outcomes are intentional, aligned, and visible rather than only stored as isolated statements.',1),
('aun-qa-v4:1.2:expectation:1','aun-qa-programme-v4:1.2','Active course learning outcomes demonstrate an explicit relationship to programme learning outcomes.','Make course-to-programme outcome alignment traceable across the curriculum.',1),
('aun-qa-v4:1.5:expectation:1','aun-qa-programme-v4:1.5','The programme can demonstrate achievement of expected learning outcomes using recorded student attainment evidence.','Connect stated outcomes to observed achievement rather than relying on curriculum design alone.',1),
('aun-qa-v4:2.1:expectation:1','aun-qa-programme-v4:2.1','Current programme and course specifications are available, identifiable, and maintained through an approval workflow.','Establish a controlled and current specification baseline for programme delivery.',1),
('aun-qa-v4:2.2:expectation:1','aun-qa-programme-v4:2.2','Curriculum design shows constructive alignment among outcomes, teaching and learning, and assessment.','Verify that learning design components support the intended outcomes coherently.',1),
('aun-qa-v4:2.4:expectation:1','aun-qa-programme-v4:2.4','Each course has a clear and traceable contribution to programme learning outcomes.','Make curriculum contribution visible at course level and support programme coverage analysis.',1),
('aun-qa-v4:3.1:expectation:1','aun-qa-programme-v4:3.1','The programme educational philosophy is documented and reflected in course-level teaching and learning design.','Connect programme teaching philosophy with actual course planning and delivery choices.',1),
('aun-qa-v4:3.3:expectation:1','aun-qa-programme-v4:3.3','Active learning is intentionally planned and visible in course and weekly learning activities.','Identify evidence that students actively engage in learning rather than only receiving instruction.',1),
('aun-qa-v4:3.6:expectation:1','aun-qa-programme-v4:3.6','Teaching and learning design is reviewed against outcomes and can be improved using documented academic review evidence.','Support continuous improvement of teaching and learning through traceable review.',1),
('aun-qa-v4:4.1:expectation:1','aun-qa-programme-v4:4.1','Assessment uses appropriate methods and is constructively aligned to course learning outcomes.','Show that assessment design measures the intended learning using suitable methods.',1),
('aun-qa-v4:4.5:expectation:1','aun-qa-programme-v4:4.5','Assessment results can be used to measure achievement of course and programme learning outcomes.','Connect assessment data to outcome-attainment evidence.',1),
('aun-qa-v4:4.6:expectation:1','aun-qa-programme-v4:4.6','Assessment feedback is planned and delivered within a defined timeframe or process.','Establish that students receive timely information that supports improvement.',1),
('aun-qa-v4:5.2:expectation:1','aun-qa-programme-v4:5.2','Academic staff workload can be measured and monitored from assigned teaching and scheduled delivery.','Provide a traceable basis for reviewing teaching workload distribution.',1),
('aun-qa-v4:5.4:expectation:1','aun-qa-programme-v4:5.4','Teaching duties can be reviewed against staff qualifications, experience, and assigned courses.','Support expert review of whether academic assignments are appropriate to staff profiles.',1);

INSERT INTO "QaExpectedEvidence" ("id","expectationId","evidenceType","description","role","sourceDomain","order") VALUES
('aun-qa-v4:1.1:evidence:1','aun-qa-v4:1.1:expectation:1','programme-outcomes','Current programme learning outcomes and their approved descriptions.','required','outcomes',1),
('aun-qa-v4:1.1:evidence:2','aun-qa-v4:1.1:expectation:1','programme-profile','Programme vision, mission, goals, or educational philosophy showing institutional context.','supportive','programme',2),
('aun-qa-v4:1.1:evidence:3','aun-qa-v4:1.1:expectation:1','published-outcomes','Published or approved programme/course documents that communicate expected outcomes.','supportive','document',3),
('aun-qa-v4:1.2:evidence:1','aun-qa-v4:1.2:expectation:1','clo-plo-mappings','Active CLO records with one or more mapped programme learning outcomes.','required','courseSpec',1),
('aun-qa-v4:1.2:evidence:2','aun-qa-v4:1.2:expectation:1','approved-course-specs','Approved course specifications containing the CLO-to-PLO alignment.','supportive','courseSpec',2),
('aun-qa-v4:1.5:evidence:1','aun-qa-v4:1.5:expectation:1','clo-achievement','Published assessment results aggregated or interpreted as CLO achievement.','required','assessment',1),
('aun-qa-v4:1.5:evidence:2','aun-qa-v4:1.5:expectation:1','programme-outcome-analysis','Programme-level review or synthesis of outcome achievement across courses/cohorts.','supportive','document',2),
('aun-qa-v4:2.1:evidence:1','aun-qa-v4:2.1:expectation:1','approved-course-specifications','Approved course specifications covering active curriculum courses.','required','courseSpec',1),
('aun-qa-v4:2.1:evidence:2','aun-qa-v4:2.1:expectation:1','programme-structure','Current programme/curriculum structure and course catalogue information.','required','programme',2),
('aun-qa-v4:2.1:evidence:3','aun-qa-v4:2.1:expectation:1','approval-history','Submission, change-request, resubmission, and approval history for course specifications.','supportive','courseSpec',3),
('aun-qa-v4:2.2:evidence:1','aun-qa-v4:2.2:expectation:1','clo-teaching-alignment','CLO links to teaching methods or active-learning strategies.','required','teachingLearning',1),
('aun-qa-v4:2.2:evidence:2','aun-qa-v4:2.2:expectation:1','clo-assessment-alignment','CLO links to assessment methods/items.','required','assessment',2),
('aun-qa-v4:2.2:evidence:3','aun-qa-v4:2.2:expectation:1','weekly-alignment','Weekly topics, activities, CLOs, teaching methods, and assessment references.','supportive','weeklyPlan',3),
('aun-qa-v4:2.4:evidence:1','aun-qa-v4:2.4:expectation:1','course-clo-plo-coverage','CLO-to-PLO mappings grouped by course.','required','courseSpec',1),
('aun-qa-v4:2.4:evidence:2','aun-qa-v4:2.4:expectation:1','curriculum-mapping','Programme-level curriculum mapping or coverage synthesis where available.','supportive','document',2),
('aun-qa-v4:3.1:evidence:1','aun-qa-v4:3.1:expectation:1','educational-philosophy','Programme educational philosophy statements.','required','programme',1),
('aun-qa-v4:3.1:evidence:2','aun-qa-v4:3.1:expectation:1','course-teaching-philosophy','Course teaching philosophy tags/statements and selected teaching methods.','required','teachingLearning',2),
('aun-qa-v4:3.3:evidence:1','aun-qa-v4:3.3:expectation:1','active-learning-strategies','Selected course/CLO active-learning strategies.','required','teachingLearning',1),
('aun-qa-v4:3.3:evidence:2','aun-qa-v4:3.3:expectation:1','weekly-student-activities','Weekly student learning activities linked to topics or outcomes.','supportive','weeklyPlan',2),
('aun-qa-v4:3.6:evidence:1','aun-qa-v4:3.6:expectation:1','course-spec-review-history','Course-spec review actions, requested changes, and approvals.','required','courseSpec',1),
('aun-qa-v4:3.6:evidence:2','aun-qa-v4:3.6:expectation:1','teaching-review-records','Meeting, review, or feedback records discussing teaching/outcome alignment.','supportive','minutes',2),
('aun-qa-v4:4.1:evidence:1','aun-qa-v4:4.1:expectation:1','assessment-plan','Active assessment items with methods, weights, and mapped CLOs.','required','assessment',1),
('aun-qa-v4:4.1:evidence:2','aun-qa-v4:4.1:expectation:1','clo-assessment-methods','CLO-specific assessment method selections or mapping cells.','required','assessment',2),
('aun-qa-v4:4.1:evidence:3','aun-qa-v4:4.1:expectation:1','rubrics','Rubrics or assessment criteria supporting transparent measurement.','supportive','assessment',3),
('aun-qa-v4:4.5:evidence:1','aun-qa-v4:4.5:expectation:1','published-results','Published student assessment results linked to assessment items.','required','assessment',1),
('aun-qa-v4:4.5:evidence:2','aun-qa-v4:4.5:expectation:1','clo-achievement','Derived or reviewed CLO achievement based on assessment results.','required','assessment',2),
('aun-qa-v4:4.5:evidence:3','aun-qa-v4:4.5:expectation:1','plo-synthesis','Programme-level synthesis of outcome achievement where available.','supportive','document',3),
('aun-qa-v4:4.6:evidence:1','aun-qa-v4:4.6:expectation:1','feedback-plan','Assessment feedback method and timeline in approved assessment plans.','required','assessment',1),
('aun-qa-v4:4.6:evidence:2','aun-qa-v4:4.6:expectation:1','published-feedback','Published assessment-result feedback records where available.','supportive','assessment',2),
('aun-qa-v4:5.2:evidence:1','aun-qa-v4:5.2:expectation:1','lecturer-assignments','Primary and co-lecturer assignments to course offerings.','required','offering',1),
('aun-qa-v4:5.2:evidence:2','aun-qa-v4:5.2:expectation:1','weekly-workload','Scheduled meetings and derived lecturer weekly teaching workload.','required','staff',2),
('aun-qa-v4:5.4:evidence:1','aun-qa-v4:5.4:expectation:1','staff-profile','Lecturer title, qualification, and available academic profile information.','required','staff',1),
('aun-qa-v4:5.4:evidence:2','aun-qa-v4:5.4:expectation:1','teaching-assignments','Courses and offerings assigned to each lecturer.','required','offering',2),
('aun-qa-v4:5.4:evidence:3','aun-qa-v4:5.4:expectation:1','supporting-cv','CV, experience record, or other staff qualification documentation where available.','supportive','document',3);
