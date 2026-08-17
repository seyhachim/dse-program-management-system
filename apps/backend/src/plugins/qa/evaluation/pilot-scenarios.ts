import {
  QA_PILOT_REQUIREMENT_CODES,
  QA_PILOT_SCENARIO_VERSION,
  type QaEvaluationScenarioEvidenceInputSchema,
  type QaPilotInitializeResult,
  type QaQualityExpectationView,
} from "@dse-pms/shared-types";
import type { z } from "zod";
import { prisma } from "../../../core/db/prisma.ts";
import { qaService } from "../service.ts";
import { createQaEvaluationScenario } from "./service.ts";

type EvidenceInput = z.infer<typeof QaEvaluationScenarioEvidenceInputSchema>;
type PrimitiveAttributes = Record<string, string | number | boolean | null>;
type ChallengeMode = "omit" | "incomplete" | "stale" | "ambiguous" | "conflicting" | "partialCoverage";

interface Challenge {
  evidenceType: string;
  mode: ChallengeMode;
}

const challengeByRequirement: Record<(typeof QA_PILOT_REQUIREMENT_CODES)[number], Challenge> = {
  "1.1": { evidenceType: "published-outcomes", mode: "conflicting" },
  "1.2": { evidenceType: "clo-plo-mappings", mode: "incomplete" },
  "1.5": { evidenceType: "clo-achievement", mode: "stale" },
  "2.1": { evidenceType: "approved-course-specifications", mode: "partialCoverage" },
  "2.2": { evidenceType: "clo-assessment-alignment", mode: "omit" },
  "2.4": { evidenceType: "course-clo-plo-coverage", mode: "incomplete" },
  "3.1": { evidenceType: "educational-philosophy", mode: "omit" },
  "3.3": { evidenceType: "active-learning-strategies", mode: "incomplete" },
  "3.6": { evidenceType: "teaching-review-records", mode: "ambiguous" },
  "4.1": { evidenceType: "assessment-plan", mode: "incomplete" },
  "4.5": { evidenceType: "clo-achievement", mode: "stale" },
  "4.6": { evidenceType: "feedback-plan", mode: "incomplete" },
  "5.2": { evidenceType: "lecturer-assignments", mode: "incomplete" },
  "5.4": { evidenceType: "supporting-cv", mode: "conflicting" },
};

const completeText: Record<string, string> = {
  "programme-outcomes": "The programme records current approved learning outcomes with clear descriptions for the review period.",
  "programme-profile": "The programme profile records current mission, goals, and educational direction relevant to the learning outcomes.",
  "published-outcomes": "The current programme handbook publishes the approved programme learning outcomes to students and stakeholders.",
  "clo-plo-mappings": "The course specification records explicit mappings from every active CLO to one or more active PLOs.",
  "approved-course-specs": "The course specification is approved and contains the current CLO-to-PLO alignment.",
  "clo-achievement": "The attainment report summarises current-cohort CLO achievement from published assessment results.",
  "programme-outcome-analysis": "The programme review report synthesises learning-outcome attainment across courses in the current review period.",
  "approved-course-specifications": "An approved and current course specification is available for an active curriculum course.",
  "programme-structure": "The curriculum structure records an active course in the current programme catalogue.",
  "approval-history": "The specification history records submission, review, requested changes where applicable, and final approval.",
  "clo-teaching-alignment": "Every active CLO has recorded teaching-method or active-learning support.",
  "clo-assessment-alignment": "Every active CLO has one or more linked assessment methods.",
  "weekly-alignment": "The weekly plan links topics and activities to CLOs, teaching methods, and assessment references.",
  "course-clo-plo-coverage": "The course records complete CLO-to-PLO coverage for all active CLOs.",
  "curriculum-mapping": "The programme curriculum map summarises course contributions to PLO coverage across the curriculum.",
  "educational-philosophy": "The programme documents an explicit educational philosophy for teaching and learning.",
  "course-teaching-philosophy": "The course teaching strategy records a philosophy statement and selected teaching methods.",
  "active-learning-strategies": "The course explicitly plans active-learning strategies linked to learning outcomes.",
  "weekly-student-activities": "Weekly plans record student learning activities that require active participation.",
  "course-spec-review-history": "The course specification has documented review actions and approval history for the current revision.",
  "teaching-review-records": "Academic review minutes discuss teaching design, learning outcomes, and follow-up improvement actions.",
  "assessment-plan": "Active assessment items have positive weights and explicit CLO mappings.",
  "clo-assessment-methods": "CLO records identify the assessment methods used to measure each active learning outcome.",
  "rubrics": "Assessment criteria describe expected performance levels for the relevant assessment tasks.",
  "published-results": "Published student assessment results are available and linked to the relevant assessment items.",
  "plo-synthesis": "A programme report synthesises outcome achievement using course-level attainment evidence.",
  "feedback-plan": "The assessment plan specifies the feedback method and a defined feedback timeline.",
  "published-feedback": "Published result records include feedback provided to students after assessment.",
  "lecturer-assignments": "Every active offering has a named primary lecturer and any co-lecturer assignments.",
  "weekly-workload": "Scheduled delivery records provide a traceable weekly teaching workload for assigned lecturers.",
  "staff-profile": "The assigned lecturer profile records a current academic qualification relevant to review of teaching duties.",
  "teaching-assignments": "The staff assignment record identifies the courses and offerings taught by the lecturer.",
  "supporting-cv": "The current staff CV records qualifications and experience relevant to the assigned teaching area.",
};

function completeAttributes(evidenceType: string): PrimitiveAttributes {
  switch (evidenceType) {
    case "educational-philosophy":
      return { items: 1 };
    case "clo-plo-mappings":
    case "course-clo-plo-coverage":
      return { activeClos: 4, mappedClos: 4 };
    case "clo-teaching-alignment":
      return { activeClos: 4, supportedClos: 4 };
    case "clo-assessment-alignment":
    case "clo-assessment-methods":
      return { assessmentMethodCount: 2 };
    case "weekly-alignment":
      return { cloCount: 2, teachingMethodCount: 2 };
    case "course-teaching-philosophy":
      return { teachingMethodCount: 3, philosophyTags: "learner-centred,active-learning" };
    case "active-learning-strategies":
      return { activeLearningCount: 2 };
    case "weekly-student-activities":
      return { activityCount: 2, studentLearningActivities: '["case analysis","group problem solving"]' };
    case "assessment-plan":
      return { cloCount: 2, weight: 30 };
    case "feedback-plan":
      return { feedbackMethod: "Written comments and consultation", feedbackTimeline: "Within 7 days" };
    case "published-feedback":
      return { feedbackCount: 12 };
    case "lecturer-assignments":
    case "teaching-assignments":
      return { primaryLecturer: "Dr Pilot Lecturer" };
    case "staff-profile":
      return { qualification: "PhD in Data Science" };
    default:
      return {};
  }
}

function incompleteAttributes(evidenceType: string): PrimitiveAttributes {
  switch (evidenceType) {
    case "clo-plo-mappings":
    case "course-clo-plo-coverage":
      return { activeClos: 4, mappedClos: 3 };
    case "clo-teaching-alignment":
      return { activeClos: 4, supportedClos: 3 };
    case "clo-assessment-alignment":
    case "clo-assessment-methods":
      return { assessmentMethodCount: 0 };
    case "active-learning-strategies":
      return { activeLearningCount: 0 };
    case "assessment-plan":
      return { cloCount: 2, weight: 0 };
    case "feedback-plan":
      return { feedbackMethod: "Written comments", feedbackTimeline: "" };
    case "lecturer-assignments":
    case "teaching-assignments":
      return { primaryLecturer: "" };
    case "staff-profile":
      return { qualification: "" };
    default:
      return { complete: false };
  }
}

function evidenceCount(
  requirementCode: string,
  evidenceType: string,
  variant: "A" | "B",
  challenge: Challenge,
): number {
  if (variant === "B" && challenge.evidenceType === evidenceType && challenge.mode === "omit") return 0;
  if (requirementCode === "2.1") {
    if (evidenceType === "programme-structure") return 3;
    if (evidenceType === "approved-course-specifications") return variant === "A" ? 3 : 1;
  }
  if (variant === "B" && challenge.evidenceType === evidenceType && challenge.mode === "conflicting") return 2;
  return 1;
}

function buildEvidenceForDefinition(options: {
  requirementCode: string;
  expectation: QaQualityExpectationView;
  definition: QaQualityExpectationView["expectedEvidence"][number];
  variant: "A" | "B";
  challenge: Challenge;
}): EvidenceInput[] {
  const { requirementCode, definition, variant, challenge } = options;
  const count = evidenceCount(requirementCode, definition.evidenceType, variant, challenge);
  const challenged = variant === "B" && challenge.evidenceType === definition.evidenceType;
  const reportingDate = challenged && challenge.mode === "stale"
    ? new Date("2020-06-30T00:00:00Z")
    : new Date("2026-06-30T00:00:00Z");

  return Array.from({ length: count }, (_, index) => {
    let text = completeText[definition.evidenceType] ?? `Controlled evidence record for ${definition.description}`;
    let attributes: PrimitiveAttributes = completeAttributes(definition.evidenceType);

    if (challenged && challenge.mode === "incomplete") {
      text = `The controlled record is present, but one or more required fields or mappings are incomplete for ${definition.description}`;
      attributes = incompleteAttributes(definition.evidenceType);
    } else if (challenged && challenge.mode === "stale") {
      text = `This record contains potentially relevant evidence for ${definition.description}, but it relates to an earlier review period and has not been confirmed as current.`;
    } else if (challenged && challenge.mode === "ambiguous") {
      text = `The record mentions ${definition.description}, but it does not clearly establish whether the discussion, decision, or follow-up applies to the current quality expectation.`;
    } else if (challenged && challenge.mode === "conflicting") {
      text = index === 0
        ? `One controlled record indicates that ${definition.description} is current and aligned for the review period.`
        : `A second controlled record contains a different version or interpretation of ${definition.description}, creating a conflict that requires expert review.`;
    } else if (challenged && challenge.mode === "partialCoverage") {
      text = `This controlled record represents only part of the programme coverage expected for ${definition.description}`;
    }

    return {
      evidenceType: definition.evidenceType,
      sourceDomain: definition.sourceDomain,
      entityType: "ControlledPilotEvidence",
      label: `${definition.evidenceType} record ${index + 1}`,
      text,
      referenceKey: `${QA_PILOT_SCENARIO_VERSION}:${requirementCode}:${variant}:${definition.evidenceType}:${index + 1}`,
      reportingDate,
      attributes,
    };
  });
}

export function buildQaPilotScenarioInput(
  expectation: QaQualityExpectationView,
  variant: "A" | "B",
) {
  const requirementCode = expectation.requirementCode as (typeof QA_PILOT_REQUIREMENT_CODES)[number];
  const challenge = challengeByRequirement[requirementCode];
  const evidence = expectation.expectedEvidence.flatMap((definition) =>
    buildEvidenceForDefinition({ requirementCode, expectation, definition, variant, challenge }),
  );

  return {
    requirementCode,
    expectationId: expectation.id,
    name: `${QA_PILOT_SCENARIO_VERSION}:${requirementCode}:${variant}`,
    description:
      `Controlled pilot scenario ${variant} for AUN-QA requirement ${requirementCode}. ` +
      "Classify the evidence independently using only the supplied records. Prototype predictions remain unavailable until the human reference classification is locked.",
    evidence,
  };
}

export async function initializeQaPilotScenarios(): Promise<QaPilotInitializeResult> {
  const knowledge = await qaService.getKnowledge();
  const pilotExpectations = QA_PILOT_REQUIREMENT_CODES.map((requirementCode) => {
    const expectation = knowledge.expectations.find((item) => item.requirementCode === requirementCode);
    if (!expectation) throw new Error(`Pilot expectation ${requirementCode} is not available`);
    return expectation;
  });

  const expectedNames = new Set(
    pilotExpectations.flatMap((expectation) => [
      `${QA_PILOT_SCENARIO_VERSION}:${expectation.requirementCode}:A`,
      `${QA_PILOT_SCENARIO_VERSION}:${expectation.requirementCode}:B`,
    ]),
  );
  const existingRows = await prisma.qaEvaluationScenario.findMany({
    where: { name: { in: [...expectedNames] } },
    select: { name: true },
  });
  const existingNames = new Set(existingRows.map((row) => row.name));
  let created = 0;

  for (const expectation of pilotExpectations) {
    for (const variant of ["A", "B"] as const) {
      const input = buildQaPilotScenarioInput(expectation, variant);
      if (existingNames.has(input.name)) continue;
      await createQaEvaluationScenario(input);
      existingNames.add(input.name);
      created += 1;
    }
  }

  return {
    version: QA_PILOT_SCENARIO_VERSION,
    created,
    existing: expectedNames.size - created,
    total: expectedNames.size,
  };
}
