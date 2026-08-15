-- AUN-QA Programme Assessment v4 foundation (issue #153).
-- Additive only: no existing programme/course-specification data is rewritten.

CREATE TYPE "QaCycleStatus" AS ENUM ('Draft', 'Active', 'UnderReview', 'Closed');
CREATE TYPE "QaEvidenceKind" AS ENUM ('SystemLink', 'ExternalLink', 'Document');
CREATE TYPE "QaEvidenceStatus" AS ENUM ('Draft', 'Ready', 'Reviewed');

CREATE TABLE "QaFramework" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaFramework_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaCriterion" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "QaCriterion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaRequirement" (
    "id" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "QaRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaAssessmentCycle" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reportingStart" TIMESTAMP(3) NOT NULL,
    "reportingEnd" TIMESTAMP(3) NOT NULL,
    "status" "QaCycleStatus" NOT NULL DEFAULT 'Draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaAssessmentCycle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QaAssessmentCycle_reporting_dates_check" CHECK ("reportingEnd" >= "reportingStart")
);

CREATE TABLE "QaEvidence" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "QaEvidenceKind" NOT NULL,
    "sourceUrl" TEXT,
    "sourceRef" TEXT NOT NULL DEFAULT '',
    "reportingPeriod" TEXT NOT NULL DEFAULT '',
    "status" "QaEvidenceStatus" NOT NULL DEFAULT 'Draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaRequirementAssessment" (
    "programmeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "rating" INTEGER,
    "narrative" TEXT NOT NULL DEFAULT '',
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaRequirementAssessment_pkey" PRIMARY KEY ("cycleId", "requirementId"),
    CONSTRAINT "QaRequirementAssessment_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 7))
);

CREATE UNIQUE INDEX "QaFramework_code_version_key" ON "QaFramework"("code", "version");
CREATE UNIQUE INDEX "QaCriterion_frameworkId_code_key" ON "QaCriterion"("frameworkId", "code");
CREATE UNIQUE INDEX "QaCriterion_frameworkId_order_key" ON "QaCriterion"("frameworkId", "order");
CREATE UNIQUE INDEX "QaRequirement_criterionId_code_key" ON "QaRequirement"("criterionId", "code");
CREATE UNIQUE INDEX "QaRequirement_criterionId_order_key" ON "QaRequirement"("criterionId", "order");
CREATE INDEX "QaRequirement_code_idx" ON "QaRequirement"("code");
CREATE INDEX "QaAssessmentCycle_programmeId_status_idx" ON "QaAssessmentCycle"("programmeId", "status");
CREATE INDEX "QaAssessmentCycle_frameworkId_idx" ON "QaAssessmentCycle"("frameworkId");
CREATE INDEX "QaEvidence_programmeId_cycleId_idx" ON "QaEvidence"("programmeId", "cycleId");
CREATE INDEX "QaEvidence_requirementId_idx" ON "QaEvidence"("requirementId");
CREATE INDEX "QaEvidence_status_idx" ON "QaEvidence"("status");
CREATE INDEX "QaRequirementAssessment_programmeId_cycleId_idx" ON "QaRequirementAssessment"("programmeId", "cycleId");
CREATE INDEX "QaRequirementAssessment_reviewerId_idx" ON "QaRequirementAssessment"("reviewerId");

ALTER TABLE "QaCriterion" ADD CONSTRAINT "QaCriterion_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "QaFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaRequirement" ADD CONSTRAINT "QaRequirement_criterionId_fkey"
    FOREIGN KEY ("criterionId") REFERENCES "QaCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaAssessmentCycle" ADD CONSTRAINT "QaAssessmentCycle_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaAssessmentCycle" ADD CONSTRAINT "QaAssessmentCycle_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "QaFramework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaAssessmentCycle" ADD CONSTRAINT "QaAssessmentCycle_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QaEvidence" ADD CONSTRAINT "QaEvidence_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidence" ADD CONSTRAINT "QaEvidence_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvidence" ADD CONSTRAINT "QaEvidence_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidence" ADD CONSTRAINT "QaEvidence_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QaRequirementAssessment" ADD CONSTRAINT "QaRequirementAssessment_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaRequirementAssessment" ADD CONSTRAINT "QaRequirementAssessment_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaRequirementAssessment" ADD CONSTRAINT "QaRequirementAssessment_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaRequirementAssessment" ADD CONSTRAINT "QaRequirementAssessment_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Install the catalogue in the migration as well as in seed.ts so production
-- deployments never depend on development seeding to open the QA dashboard.
INSERT INTO "QaFramework" ("id", "code", "name", "version", "sourceUrl", "active", "updatedAt") VALUES
('aun-qa-programme-v4', 'AUN-QA-PA', 'AUN-QA Assessment at Programme Level', '4.0', 'https://www.aunsec.org/application/files/9117/7942/9691/Guide_to_AUN-QA_Assessment_at_Programme_Level_Version_4.0.pdf', true, CURRENT_TIMESTAMP);

INSERT INTO "QaCriterion" ("id", "frameworkId", "code", "title", "summary", "order") VALUES
('aun-qa-programme-v4:1', 'aun-qa-programme-v4', '1', 'Expected Learning Outcomes', 'How programme and course outcomes are formulated, aligned, informed, and achieved.', 1),
('aun-qa-programme-v4:2', 'aun-qa-programme-v4', '2', 'Programme Structure and Content', 'How curriculum content is specified, aligned, sequenced, reviewed, and communicated.', 2),
('aun-qa-programme-v4:3', 'aun-qa-programme-v4', '3', 'Teaching and Learning Approach', 'How educational philosophy and learning activities create active, responsible, lifelong learners.', 3),
('aun-qa-programme-v4:4', 'aun-qa-programme-v4', '4', 'Student Assessment', 'How assessment is aligned, fair, transparent, timely, and continuously improved.', 4),
('aun-qa-programme-v4:5', 'aun-qa-programme-v4', '5', 'Academic Staff', 'How academic staffing, workload, competence, development, and performance are managed.', 5),
('aun-qa-programme-v4:6', 'aun-qa-programme-v4', '6', 'Student Support Services', 'How admissions, progress monitoring, co-curricular support, and support services meet student needs.', 6),
('aun-qa-programme-v4:7', 'aun-qa-programme-v4', '7', 'Facilities and Infrastructure', 'How physical, digital, safety, accessibility, and wellbeing resources support the programme.', 7),
('aun-qa-programme-v4:8', 'aun-qa-programme-v4', '8', 'Output and Outcomes', 'How graduate, employment, research, outcome-achievement, and satisfaction results are monitored and improved.', 8);

INSERT INTO "QaRequirement" ("id", "criterionId", "code", "title", "order") VALUES
('aun-qa-programme-v4:1.1', 'aun-qa-programme-v4:1', '1.1', 'Outcome formulation, institutional alignment, and communication', 1),
('aun-qa-programme-v4:1.2', 'aun-qa-programme-v4:1', '1.2', 'Course outcomes aligned with programme outcomes', 2),
('aun-qa-programme-v4:1.3', 'aun-qa-programme-v4:1', '1.3', 'Balance of generic and discipline-specific outcomes', 3),
('aun-qa-programme-v4:1.4', 'aun-qa-programme-v4:1', '1.4', 'Stakeholder needs reflected in expected outcomes', 4),
('aun-qa-programme-v4:1.5', 'aun-qa-programme-v4:1', '1.5', 'Graduate achievement of expected outcomes', 5),
('aun-qa-programme-v4:2.1', 'aun-qa-programme-v4:2', '2.1', 'Current and accessible programme and course specifications', 1),
('aun-qa-programme-v4:2.2', 'aun-qa-programme-v4:2', '2.2', 'Constructive alignment of the curriculum', 2),
('aun-qa-programme-v4:2.3', 'aun-qa-programme-v4:2', '2.3', 'Stakeholder feedback in curriculum design', 3),
('aun-qa-programme-v4:2.4', 'aun-qa-programme-v4:2', '2.4', 'Clear course contribution to programme outcomes', 4),
('aun-qa-programme-v4:2.5', 'aun-qa-programme-v4:2', '2.5', 'Logical sequencing and integration of courses', 5),
('aun-qa-programme-v4:2.6', 'aun-qa-programme-v4:2', '2.6', 'Major or minor specialisation options', 6),
('aun-qa-programme-v4:2.7', 'aun-qa-programme-v4:2', '2.7', 'Periodic, industry-relevant curriculum review', 7),
('aun-qa-programme-v4:3.1', 'aun-qa-programme-v4:3', '3.1', 'Educational philosophy communicated and reflected in practice', 1),
('aun-qa-programme-v4:3.2', 'aun-qa-programme-v4:3', '3.2', 'Responsible student participation in learning', 2),
('aun-qa-programme-v4:3.3', 'aun-qa-programme-v4:3', '3.3', 'Active learning', 3),
('aun-qa-programme-v4:3.4', 'aun-qa-programme-v4:3', '3.4', 'Learning-to-learn and lifelong-learning development', 4),
('aun-qa-programme-v4:3.5', 'aun-qa-programme-v4:3', '3.5', 'Creativity, innovation, and entrepreneurial mindset', 5),
('aun-qa-programme-v4:3.6', 'aun-qa-programme-v4:3', '3.6', 'Continuous improvement and outcome alignment', 6),
('aun-qa-programme-v4:4.1', 'aun-qa-programme-v4:4', '4.1', 'Varied and constructively aligned assessment methods', 1),
('aun-qa-programme-v4:4.2', 'aun-qa-programme-v4:4', '4.2', 'Explicit and consistently applied assessment and appeal policies', 2),
('aun-qa-programme-v4:4.3', 'aun-qa-programme-v4:4', '4.3', 'Clear progression and degree-completion standards', 3),
('aun-qa-programme-v4:4.4', 'aun-qa-programme-v4:4', '4.4', 'Valid, reliable, and fair assessment instruments', 4),
('aun-qa-programme-v4:4.5', 'aun-qa-programme-v4:4', '4.5', 'Measurement of course and programme outcomes', 5),
('aun-qa-programme-v4:4.6', 'aun-qa-programme-v4:4', '4.6', 'Timely assessment feedback', 6),
('aun-qa-programme-v4:4.7', 'aun-qa-programme-v4:4', '4.7', 'Continuous review and improvement of assessment', 7),
('aun-qa-programme-v4:5.1', 'aun-qa-programme-v4:5', '5.1', 'Academic workforce and succession planning', 1),
('aun-qa-programme-v4:5.2', 'aun-qa-programme-v4:5', '5.2', 'Staff workload measurement and monitoring', 2),
('aun-qa-programme-v4:5.3', 'aun-qa-programme-v4:5', '5.3', 'Academic staff competence management', 3),
('aun-qa-programme-v4:5.4', 'aun-qa-programme-v4:5', '5.4', 'Duties aligned with qualifications and experience', 4),
('aun-qa-programme-v4:5.5', 'aun-qa-programme-v4:5', '5.5', 'Merit-based promotion', 5),
('aun-qa-programme-v4:5.6', 'aun-qa-programme-v4:5', '5.6', 'Defined rights, roles, ethics, and accountability', 6),
('aun-qa-programme-v4:5.7', 'aun-qa-programme-v4:5', '5.7', 'Systematic staff training and development', 7),
('aun-qa-programme-v4:5.8', 'aun-qa-programme-v4:5', '5.8', 'Performance management, reward, and recognition', 8),
('aun-qa-programme-v4:6.1', 'aun-qa-programme-v4:6', '6.1', 'Clear and current admission policy and procedures', 1),
('aun-qa-programme-v4:6.2', 'aun-qa-programme-v4:6', '6.2', 'Planning for sufficient, quality support services', 2),
('aun-qa-programme-v4:6.3', 'aun-qa-programme-v4:6', '6.3', 'Student progress, performance, and workload monitoring', 3),
('aun-qa-programme-v4:6.4', 'aun-qa-programme-v4:6', '6.4', 'Co-curricular and employability support', 4),
('aun-qa-programme-v4:6.5', 'aun-qa-programme-v4:6', '6.5', 'Support staff competence and role clarity', 5),
('aun-qa-programme-v4:6.6', 'aun-qa-programme-v4:6', '6.6', 'Evaluation, benchmarking, and enhancement of support', 6),
('aun-qa-programme-v4:7.1', 'aun-qa-programme-v4:7', '7.1', 'Sufficient physical and technology resources', 1),
('aun-qa-programme-v4:7.2', 'aun-qa-programme-v4:7', '7.2', 'Current and available laboratories and equipment', 2),
('aun-qa-programme-v4:7.3', 'aun-qa-programme-v4:7', '7.3', 'Digital library provision', 3),
('aun-qa-programme-v4:7.4', 'aun-qa-programme-v4:7', '7.4', 'Information systems meeting staff and student needs', 4),
('aun-qa-programme-v4:7.5', 'aun-qa-programme-v4:7', '7.5', 'Accessible computer and network infrastructure', 5),
('aun-qa-programme-v4:7.6', 'aun-qa-programme-v4:7', '7.6', 'Environment, health, safety, and accessibility standards', 6),
('aun-qa-programme-v4:7.7', 'aun-qa-programme-v4:7', '7.7', 'Environment supporting learning, research, and wellbeing', 7),
('aun-qa-programme-v4:7.8', 'aun-qa-programme-v4:7', '7.8', 'Facilities support-staff competence', 8),
('aun-qa-programme-v4:7.9', 'aun-qa-programme-v4:7', '7.9', 'Facilities evaluation and enhancement', 9),
('aun-qa-programme-v4:8.1', 'aun-qa-programme-v4:8', '8.1', 'Completion, dropout, and time-to-graduate performance', 1),
('aun-qa-programme-v4:8.2', 'aun-qa-programme-v4:8', '8.2', 'Employment, entrepreneurship, and further-study outcomes', 2),
('aun-qa-programme-v4:8.3', 'aun-qa-programme-v4:8', '8.3', 'Research and creative-work outputs', 3),
('aun-qa-programme-v4:8.4', 'aun-qa-programme-v4:8', '8.4', 'Direct achievement of programme outcomes', 4),
('aun-qa-programme-v4:8.5', 'aun-qa-programme-v4:8', '8.5', 'Stakeholder satisfaction and benchmarking', 5);

-- Production deployments use migrate deploy without running the development
-- seed, so install the new permission grants additively here as well.
INSERT INTO "Permission" ("id", "slug", "title", "active", "updatedAt") VALUES
('permission-qa-read', 'qa:read', 'View programme quality-assurance evidence and reviews', true, CURRENT_TIMESTAMP),
('permission-qa-write', 'qa:write', 'Manage programme quality-assurance evidence and self-assessments', true, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "title" = EXCLUDED."title", "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "updatedAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."slug" IN ('admin', 'program_coordinator', 'qa_reviewer')
  AND permission."slug" IN ('qa:read', 'qa:write')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
