import { z } from "zod";
import type {
  QaApplicabilityRule,
  QaEvidenceScopeRequirement,
  QaSourceAuthorityRequirement,
  QaTemporalRule,
} from "./qa-evidence-semantics.ts";

export const QA_PILOT_REQUIREMENT_CODES = [
  "1.1", "1.2", "1.5",
  "2.1", "2.2", "2.4",
  "3.1", "3.3", "3.6",
  "4.1", "4.5", "4.6",
  "5.2", "5.4",
] as const;

export const QaExpectedEvidenceRoleSchema = z.enum(["required", "supportive", "contextual"]);
export const QaEvidenceSourceDomainSchema = z.enum([
  "programme",
  "outcomes",
  "courseSpec",
  "teachingLearning",
  "weeklyPlan",
  "assessment",
  "staff",
  "offering",
  "document",
  "survey",
  "minutes",
  "policy",
]);

export type QaExpectedEvidenceRole = z.infer<typeof QaExpectedEvidenceRoleSchema>;
export type QaEvidenceSourceDomain = z.infer<typeof QaEvidenceSourceDomainSchema>;

export interface QaExpectedEvidenceDefinitionView {
  id: string;
  evidenceType: string;
  description: string;
  role: QaExpectedEvidenceRole;
  sourceDomain: QaEvidenceSourceDomain;
  order: number;
  scopeRequirement: QaEvidenceScopeRequirement;
  temporalRule: QaTemporalRule;
  authorityRequirement: QaSourceAuthorityRequirement;
}

export interface QaQualityExpectationView {
  id: string;
  requirementCode: string;
  statement: string;
  purpose: string;
  order: number;
  applicabilityRule: QaApplicabilityRule;
  scopeRequirement: QaEvidenceScopeRequirement;
  temporalRule: QaTemporalRule;
  expectedEvidence: QaExpectedEvidenceDefinitionView[];
}

export interface QaKnowledgeView {
  frameworkId: string;
  frameworkVersion: string;
  pilotRequirementCodes: readonly string[];
  expectations: QaQualityExpectationView[];
}

/**
 * Product-facing pilot knowledge for issue #185. These statements are concise
 * operational interpretations used to drive evidence discovery; they are not
 * substitutes for the official AUN-QA guide text.
 */
export const AUN_QA_V4_PILOT_KNOWLEDGE = [
  {
    requirementCode: "1.1",
    statement: "Programme learning outcomes are explicitly formulated, aligned with institutional direction, and communicated to relevant stakeholders.",
    purpose: "Establish that programme outcomes are intentional, aligned, and visible rather than only stored as isolated statements.",
    evidence: [
      ["programme-outcomes", "Current programme learning outcomes and their approved descriptions.", "required", "outcomes"],
      ["programme-profile", "Programme vision, mission, goals, or educational philosophy showing institutional context.", "supportive", "programme"],
      ["published-outcomes", "Published or approved programme/course documents that communicate expected outcomes.", "supportive", "document"],
    ],
  },
  {
    requirementCode: "1.2",
    statement: "Active course learning outcomes demonstrate an explicit relationship to programme learning outcomes.",
    purpose: "Make course-to-programme outcome alignment traceable across the curriculum.",
    evidence: [
      ["clo-plo-mappings", "Active CLO records with one or more mapped programme learning outcomes.", "required", "courseSpec"],
      ["approved-course-specs", "Approved course specifications containing the CLO-to-PLO alignment.", "supportive", "courseSpec"],
    ],
  },
  {
    requirementCode: "1.5",
    statement: "The programme can demonstrate achievement of expected learning outcomes using recorded student attainment evidence.",
    purpose: "Connect stated outcomes to observed achievement rather than relying on curriculum design alone.",
    evidence: [
      ["clo-achievement", "Published assessment results aggregated or interpreted as CLO achievement.", "required", "assessment"],
      ["programme-outcome-analysis", "Programme-level review or synthesis of outcome achievement across courses/cohorts.", "supportive", "document"],
    ],
  },
  {
    requirementCode: "2.1",
    statement: "Current programme and course specifications are available, identifiable, and maintained through an approval workflow.",
    purpose: "Establish a controlled and current specification baseline for programme delivery.",
    evidence: [
      ["approved-course-specifications", "Approved course specifications covering active curriculum courses.", "required", "courseSpec"],
      ["programme-structure", "Current programme/curriculum structure and course catalogue information.", "required", "programme"],
      ["approval-history", "Submission, change-request, resubmission, and approval history for course specifications.", "supportive", "courseSpec"],
    ],
  },
  {
    requirementCode: "2.2",
    statement: "Curriculum design shows constructive alignment among outcomes, teaching and learning, and assessment.",
    purpose: "Verify that learning design components support the intended outcomes coherently.",
    evidence: [
      ["clo-teaching-alignment", "CLO links to teaching methods or active-learning strategies.", "required", "teachingLearning"],
      ["clo-assessment-alignment", "CLO links to assessment methods/items.", "required", "assessment"],
      ["weekly-alignment", "Weekly topics, activities, CLOs, teaching methods, and assessment references.", "supportive", "weeklyPlan"],
    ],
  },
  {
    requirementCode: "2.4",
    statement: "Each course has a clear and traceable contribution to programme learning outcomes.",
    purpose: "Make curriculum contribution visible at course level and support programme coverage analysis.",
    evidence: [
      ["course-clo-plo-coverage", "CLO-to-PLO mappings grouped by course.", "required", "courseSpec"],
      ["curriculum-mapping", "Programme-level curriculum mapping or coverage synthesis where available.", "supportive", "document"],
    ],
  },
  {
    requirementCode: "3.1",
    statement: "The programme educational philosophy is documented and reflected in course-level teaching and learning design.",
    purpose: "Connect programme teaching philosophy with actual course planning and delivery choices.",
    evidence: [
      ["educational-philosophy", "Programme educational philosophy statements.", "required", "programme"],
      ["course-teaching-philosophy", "Course teaching philosophy tags/statements and selected teaching methods.", "required", "teachingLearning"],
    ],
  },
  {
    requirementCode: "3.3",
    statement: "Active learning is intentionally planned and visible in course and weekly learning activities.",
    purpose: "Identify evidence that students actively engage in learning rather than only receiving instruction.",
    evidence: [
      ["active-learning-strategies", "Selected course/CLO active-learning strategies.", "required", "teachingLearning"],
      ["weekly-student-activities", "Weekly student learning activities linked to topics or outcomes.", "supportive", "weeklyPlan"],
    ],
  },
  {
    requirementCode: "3.6",
    statement: "Teaching and learning design is reviewed against outcomes and can be improved using documented academic review evidence.",
    purpose: "Support continuous improvement of teaching and learning through traceable review.",
    evidence: [
      ["course-spec-review-history", "Course-spec review actions, requested changes, and approvals.", "required", "courseSpec"],
      ["teaching-review-records", "Meeting, review, or feedback records discussing teaching/outcome alignment.", "supportive", "minutes"],
    ],
  },
  {
    requirementCode: "4.1",
    statement: "Assessment uses appropriate methods and is constructively aligned to course learning outcomes.",
    purpose: "Show that assessment design measures the intended learning using suitable methods.",
    evidence: [
      ["assessment-plan", "Active assessment items with methods, weights, and mapped CLOs.", "required", "assessment"],
      ["clo-assessment-methods", "CLO-specific assessment method selections or mapping cells.", "required", "assessment"],
      ["rubrics", "Rubrics or assessment criteria supporting transparent measurement.", "supportive", "assessment"],
    ],
  },
  {
    requirementCode: "4.5",
    statement: "Assessment results can be used to measure achievement of course and programme learning outcomes.",
    purpose: "Connect assessment data to outcome-attainment evidence.",
    evidence: [
      ["published-results", "Published student assessment results linked to assessment items.", "required", "assessment"],
      ["clo-achievement", "Derived or reviewed CLO achievement based on assessment results.", "required", "assessment"],
      ["plo-synthesis", "Programme-level synthesis of outcome achievement where available.", "supportive", "document"],
    ],
  },
  {
    requirementCode: "4.6",
    statement: "Assessment feedback is planned and delivered within a defined timeframe or process.",
    purpose: "Establish that students receive timely information that supports improvement.",
    evidence: [
      ["feedback-plan", "Assessment feedback method and timeline in approved assessment plans.", "required", "assessment"],
      ["published-feedback", "Published assessment-result feedback records where available.", "supportive", "assessment"],
    ],
  },
  {
    requirementCode: "5.2",
    statement: "Academic staff workload can be measured and monitored from assigned teaching and scheduled delivery.",
    purpose: "Provide a traceable basis for reviewing teaching workload distribution.",
    evidence: [
      ["lecturer-assignments", "Primary and co-lecturer assignments to course offerings.", "required", "offering"],
      ["weekly-workload", "Scheduled meetings and derived lecturer weekly teaching workload.", "required", "staff"],
    ],
  },
  {
    requirementCode: "5.4",
    statement: "Teaching duties can be reviewed against staff qualifications, experience, and assigned courses.",
    purpose: "Support expert review of whether academic assignments are appropriate to staff profiles.",
    evidence: [
      ["staff-profile", "Lecturer title, qualification, and available academic profile information.", "required", "staff"],
      ["teaching-assignments", "Courses and offerings assigned to each lecturer.", "required", "offering"],
      ["supporting-cv", "CV, experience record, or other staff qualification documentation where available.", "supportive", "document"],
    ],
  },
] as const;
