import type {
  QaEvidenceCandidateResultView,
  QaExpectedEvidenceDefinitionView,
  QaEvidenceAnalysisState,
} from "@dse-pms/shared-types";

export const QA_DETERMINISTIC_RULE_VERSION = "1.0.0";

export type QaRuleFindingState = "satisfied" | "gap" | "ambiguous";

export interface QaEvidenceRuleFinding {
  definition: QaExpectedEvidenceDefinitionView;
  result: QaEvidenceCandidateResultView;
  state: QaRuleFindingState;
  explanation: string;
}

function numberAttr(
  candidate: QaEvidenceCandidateResultView["candidates"][number],
  key: string,
): number | null {
  const value = candidate.attributes[key];
  return typeof value === "number" ? value : null;
}

function stringAttr(
  candidate: QaEvidenceCandidateResultView["candidates"][number],
  key: string,
): string {
  const value = candidate.attributes[key];
  return typeof value === "string" ? value.trim() : "";
}

function allCandidates(
  result: QaEvidenceCandidateResultView,
  predicate: (candidate: QaEvidenceCandidateResultView["candidates"][number]) => boolean,
): boolean {
  return result.candidates.length > 0 && result.candidates.every(predicate);
}

function satisfied(
  definition: QaExpectedEvidenceDefinitionView,
  result: QaEvidenceCandidateResultView,
  explanation: string,
): QaEvidenceRuleFinding {
  return { definition, result, state: "satisfied", explanation };
}

function gap(
  definition: QaExpectedEvidenceDefinitionView,
  result: QaEvidenceCandidateResultView,
  explanation: string,
): QaEvidenceRuleFinding {
  return { definition, result, state: "gap", explanation };
}

function ambiguous(
  definition: QaExpectedEvidenceDefinitionView,
  result: QaEvidenceCandidateResultView,
  explanation: string,
): QaEvidenceRuleFinding {
  return { definition, result, state: "ambiguous", explanation };
}

export function evaluateExpectedEvidence(
  definition: QaExpectedEvidenceDefinitionView,
  result: QaEvidenceCandidateResultView,
): QaEvidenceRuleFinding {
  if (result.status === "unsupported") {
    return ambiguous(
      definition,
      result,
      `${definition.evidenceType}: deterministic retrieval is unavailable. ${result.reason}`,
    );
  }

  if (result.candidates.length === 0) {
    return gap(
      definition,
      result,
      `${definition.evidenceType}: the registered structured source was searched but no candidate evidence was found.`,
    );
  }

  switch (definition.evidenceType) {
    case "programme-outcomes":
    case "programme-profile":
    case "programme-structure":
    case "approved-course-specs":
    case "approved-course-specifications":
    case "approval-history":
    case "published-results":
    case "weekly-workload":
      return satisfied(
        definition,
        result,
        `${definition.evidenceType}: ${result.candidates.length} structured candidate(s) were identified.`,
      );

    case "educational-philosophy": {
      const complete = allCandidates(result, (candidate) => (numberAttr(candidate, "items") ?? 0) > 0);
      return complete
        ? satisfied(definition, result, "educational-philosophy: a non-empty programme educational philosophy is recorded.")
        : gap(definition, result, "educational-philosophy: the programme profile exists but no educational-philosophy item is recorded.");
    }

    case "clo-plo-mappings":
    case "course-clo-plo-coverage": {
      const complete = allCandidates(result, (candidate) => {
        const active = numberAttr(candidate, "activeClos") ?? 0;
        const mapped = numberAttr(candidate, "mappedClos") ?? 0;
        return active > 0 && mapped === active;
      });
      return complete
        ? satisfied(definition, result, `${definition.evidenceType}: every returned course specification has all active CLOs mapped to at least one PLO.`)
        : gap(definition, result, `${definition.evidenceType}: at least one course specification has no active CLOs or has an active CLO without a PLO mapping.`);
    }

    case "clo-teaching-alignment": {
      const complete = allCandidates(result, (candidate) => {
        const active = numberAttr(candidate, "activeClos") ?? 0;
        const supported = numberAttr(candidate, "supportedClos") ?? 0;
        return active > 0 && supported === active;
      });
      return complete
        ? satisfied(definition, result, "clo-teaching-alignment: every active CLO has recorded teaching-method or active-learning support.")
        : gap(definition, result, "clo-teaching-alignment: at least one active CLO lacks recorded teaching-method or active-learning support.");
    }

    case "clo-assessment-alignment":
    case "clo-assessment-methods": {
      const complete = allCandidates(
        result,
        (candidate) => (numberAttr(candidate, "assessmentMethodCount") ?? 0) > 0,
      );
      return complete
        ? satisfied(definition, result, `${definition.evidenceType}: every returned active CLO has at least one linked assessment method.`)
        : gap(definition, result, `${definition.evidenceType}: at least one returned active CLO has no linked assessment method.`);
    }

    case "weekly-alignment": {
      const complete = allCandidates(result, (candidate) => {
        const cloCount = numberAttr(candidate, "cloCount") ?? 0;
        const teachingCount = numberAttr(candidate, "teachingMethodCount") ?? 0;
        return cloCount > 0 && teachingCount > 0;
      });
      return complete
        ? satisfied(definition, result, "weekly-alignment: weekly plans identify CLOs and teaching methods across returned weeks.")
        : gap(definition, result, "weekly-alignment: at least one returned week lacks a CLO reference or teaching method.");
    }

    case "course-teaching-philosophy": {
      const complete = allCandidates(result, (candidate) => {
        const tags = stringAttr(candidate, "philosophyTags");
        const teachingCount = numberAttr(candidate, "teachingMethodCount") ?? 0;
        const hasStatement = candidate.summary !== "Course-level teaching and learning strategy is recorded.";
        return teachingCount > 0 && (tags.length > 0 || hasStatement);
      });
      return complete
        ? satisfied(definition, result, "course-teaching-philosophy: returned course strategies contain teaching methods and an explicit philosophy statement or tag.")
        : gap(definition, result, "course-teaching-philosophy: at least one returned course strategy lacks teaching methods or an explicit philosophy statement/tag.");
    }

    case "active-learning-strategies": {
      const complete = allCandidates(
        result,
        (candidate) => (numberAttr(candidate, "activeLearningCount") ?? 0) > 0,
      );
      return complete
        ? satisfied(definition, result, "active-learning-strategies: active-learning strategies are recorded for every returned course strategy.")
        : gap(definition, result, "active-learning-strategies: at least one returned course strategy has no active-learning strategy recorded.");
    }

    case "weekly-student-activities": {
      const complete = allCandidates(result, (candidate) => {
        const activities = numberAttr(candidate, "activityCount") ?? 0;
        const structuredActivities = stringAttr(candidate, "studentLearningActivities");
        return activities > 0 || (structuredActivities !== "" && structuredActivities !== "null" && structuredActivities !== "[]");
      });
      return complete
        ? satisfied(definition, result, "weekly-student-activities: student learning activity evidence is recorded across returned weekly plans.")
        : gap(definition, result, "weekly-student-activities: at least one returned weekly plan has no student learning activity recorded.");
    }

    case "course-spec-review-history":
      return ambiguous(
        definition,
        result,
        "course-spec-review-history: review actions exist, but a deterministic rule cannot establish that the review specifically evaluated teaching and learning against outcomes.",
      );

    case "assessment-plan": {
      const complete = allCandidates(result, (candidate) => {
        const cloCount = numberAttr(candidate, "cloCount") ?? 0;
        const weight = numberAttr(candidate, "weight");
        return cloCount > 0 && weight !== null && weight > 0;
      });
      return complete
        ? satisfied(definition, result, "assessment-plan: returned active assessments have positive weights and mapped CLOs.")
        : gap(definition, result, "assessment-plan: at least one returned active assessment lacks a positive weight or mapped CLO.");
    }

    case "feedback-plan": {
      const complete = allCandidates(
        result,
        (candidate) => stringAttr(candidate, "feedbackMethod") !== "" && stringAttr(candidate, "feedbackTimeline") !== "",
      );
      return complete
        ? satisfied(definition, result, "feedback-plan: returned assessments specify both feedback method and feedback timeline.")
        : gap(definition, result, "feedback-plan: at least one returned assessment lacks a feedback method or timeline.");
    }

    case "published-feedback": {
      const complete = result.candidates.some(
        (candidate) => (numberAttr(candidate, "feedbackCount") ?? 0) > 0,
      );
      return complete
        ? satisfied(definition, result, "published-feedback: at least one published result set contains student feedback records.")
        : gap(definition, result, "published-feedback: published results were found but no feedback text was recorded.");
    }

    case "lecturer-assignments":
    case "teaching-assignments": {
      const complete = allCandidates(result, (candidate) => stringAttr(candidate, "primaryLecturer") !== "");
      return complete
        ? satisfied(definition, result, `${definition.evidenceType}: every returned offering has a primary lecturer recorded.`)
        : gap(definition, result, `${definition.evidenceType}: at least one returned offering has no primary lecturer recorded.`);
    }

    case "staff-profile": {
      const complete = allCandidates(result, (candidate) => stringAttr(candidate, "qualification") !== "");
      return complete
        ? satisfied(definition, result, "staff-profile: qualification information is recorded for every returned assigned lecturer.")
        : gap(definition, result, "staff-profile: at least one returned assigned lecturer has no qualification recorded.");
    }

    default:
      return ambiguous(
        definition,
        result,
        `${definition.evidenceType}: candidates were retrieved, but no deterministic completeness rule is registered for this evidence type.`,
      );
  }
}

export function applyExpectationCrossChecks(
  requirementCode: string,
  findings: QaEvidenceRuleFinding[],
): QaEvidenceRuleFinding[] {
  if (requirementCode !== "2.1") return findings;

  const structure = findings.find((finding) => finding.definition.evidenceType === "programme-structure");
  const approved = findings.find(
    (finding) => finding.definition.evidenceType === "approved-course-specifications",
  );
  if (!structure || !approved || structure.result.status !== "supported" || approved.result.status !== "supported") {
    return findings;
  }

  const courseCount = structure.result.candidates.length;
  const approvedCount = approved.result.candidates.length;
  if (courseCount > 0 && approvedCount < courseCount) {
    return findings.map((finding) =>
      finding === approved
        ? {
            ...finding,
            state: "gap",
            explanation: `approved-course-specifications: ${approvedCount} approved specification(s) were found for ${courseCount} programme course(s).`,
          }
        : finding,
    );
  }
  return findings;
}

const semanticExpertReviewRequirements = new Set(["1.1", "3.6", "5.4"]);

export function determineExpectationState(
  requirementCode: string,
  findings: QaEvidenceRuleFinding[],
): { state: QaEvidenceAnalysisState; uncertaintyNote: string } {
  const required = findings.filter((finding) => finding.definition.role === "required");

  if (required.some((finding) => finding.state === "gap")) {
    return {
      state: "potentialEvidenceGap",
      uncertaintyNote: "At least one required structured evidence source was available to the rule engine but was absent or incomplete. This is an evidence-gap signal, not a quality judgment.",
    };
  }

  if (
    required.length === 0 ||
    required.some((finding) => finding.state === "ambiguous") ||
    semanticExpertReviewRequirements.has(requirementCode)
  ) {
    return {
      state: "expertReviewRequired",
      uncertaintyNote: "Available evidence cannot be interpreted conclusively by deterministic rules alone. Human QA review is required before drawing any quality conclusion.",
    };
  }

  return {
    state: "evidenceIdentified",
    uncertaintyNote: "Required structured evidence satisfied the registered deterministic completeness rules. This finding remains advisory and is not an AUN-QA rating.",
  };
}

export function buildDeterministicExplanation(
  requirementCode: string,
  findings: QaEvidenceRuleFinding[],
  state: QaEvidenceAnalysisState,
): string {
  const headline =
    state === "evidenceIdentified"
      ? `Evidence identified for ${requirementCode}.`
      : state === "potentialEvidenceGap"
        ? `Potential evidence gap identified for ${requirementCode}.`
        : `Expert review required for ${requirementCode}.`;

  const details = findings
    .map((finding) => {
      const role = finding.definition.role;
      return `[${role}; ${finding.state}] ${finding.explanation}`;
    })
    .join(" ");

  return `${headline} ${details}`.trim();
}
