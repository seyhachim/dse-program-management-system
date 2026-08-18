import type {
  QaEvidenceCandidateView,
  QaEvidenceRelationshipLink,
} from "@dse-pms/shared-types";

export type QaRelationshipFindingState = "satisfied" | "gap" | "ambiguous";
export interface QaRelationshipFinding {
  link: QaEvidenceRelationshipLink;
  state: QaRelationshipFindingState;
  matchedPairs: Array<{ fromCandidateKey: string; toCandidateKey: string }>;
  explanation: string;
}

function attr(candidate: QaEvidenceCandidateView, key: string): string | null {
  const value = candidate.attributes[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function directIdProof(
  from: QaEvidenceCandidateView, to: QaEvidenceCandidateView, fromKey: string, toKey: string,
): boolean | null {
  const left = attr(from, fromKey);
  const right = attr(to, toKey);
  if (!left || !right) return null;
  return left === right;
}

function exactSharedScopeProof(from: QaEvidenceCandidateView, to: QaEvidenceCandidateView): boolean | null {
  const keys = ["assessmentId", "offeringId", "courseSpecVersionId", "courseId", "cohortId"] as const;
  let compared = 0;
  for (const key of keys) {
    const left = from.scope?.[key];
    const right = to.scope?.[key];
    if (!left || !right) continue;
    compared += 1;
    if (left !== right) return false;
  }
  return compared > 0 ? true : null;
}

function sourceReferenceProof(from: QaEvidenceCandidateView, to: QaEvidenceCandidateView): boolean | null {
  const values = [attr(from, "sourceRefs"), attr(from, "sourceIds"), attr(from, "sourceAssessmentIds"), attr(from, "sourceResultIds")].filter((value): value is string => Boolean(value));
  if (values.length === 0) return null;
  const targets = new Set([to.entityId, to.key, attr(to, "assessmentId")].filter((value): value is string => Boolean(value)));
  const tokens = values.flatMap((value) => value.split(/[;,]/).map((item) => item.trim()).filter(Boolean));
  return tokens.some((token) => targets.has(token));
}

function pairProof(link: QaEvidenceRelationshipLink, from: QaEvidenceCandidateView, to: QaEvidenceCandidateView): boolean | null {
  if (link.relation === "reviewedBy") return directIdProof(from, to, "analysisId", "analysisId");
  if (link.relation === "resultsIn") return directIdProof(from, to, "reviewId", "reviewId");
  if (link.relation === "followedUpBy") return directIdProof(from, to, "actionId", "actionId");
  if (link.relation === "supports") return exactSharedScopeProof(from, to);
  const referenced = sourceReferenceProof(from, to);
  if (referenced !== null) return referenced;
  return directIdProof(from, to, "assessmentId", "assessmentId");
}

export function evaluateRelationship(
  link: QaEvidenceRelationshipLink,
  fromCandidates: QaEvidenceCandidateView[],
  toCandidates: QaEvidenceCandidateView[],
): QaRelationshipFinding {
  if (fromCandidates.length === 0 || toCandidates.length === 0) {
    return { link, state: "ambiguous", matchedPairs: [], explanation: `${link.relation}: relationship cannot be evaluated because one evidence side has no accepted candidate.` };
  }
  const matchedPairs: QaRelationshipFinding["matchedPairs"] = [];
  let ambiguous = false;
  let explicitMismatch = false;
  for (const from of fromCandidates) {
    let matched = false;
    let fromAmbiguous = false;
    let fromExplicitMismatch = false;
    for (const to of toCandidates) {
      const proof = pairProof(link, from, to);
      if (proof === true) { matched = true; matchedPairs.push({ fromCandidateKey: from.key, toCandidateKey: to.key }); break; }
      if (proof === false) fromExplicitMismatch = true;
      if (proof === null) fromAmbiguous = true;
    }
    if (!matched) {
      if (fromAmbiguous) ambiguous = true;
      else if (fromExplicitMismatch) explicitMismatch = true;
      else ambiguous = true;
    }
  }
  if (matchedPairs.length === fromCandidates.length) {
    return { link, state: "satisfied", matchedPairs, explanation: `${link.relation}: every accepted ${link.fromEvidenceType} candidate has a deterministic link to ${link.toEvidenceType}.` };
  }
  if (ambiguous) {
    return { link, state: "ambiguous", matchedPairs, explanation: `${link.relation}: available candidates do not expose enough explicit relationship identity to prove every required link; human review is required.` };
  }
  return { link, state: "gap", matchedPairs, explanation: `${link.relation}: candidates expose explicit relationship identities, but at least one required source candidate does not link to the target evidence.` };
}
