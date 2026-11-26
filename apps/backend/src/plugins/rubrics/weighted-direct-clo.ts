import { createHash } from "node:crypto";
import {
  candidateDirectLevel, candidatePopulation, candidateStudentAttained, type CandidatePolicy,
} from "./clo-attainment-policy.ts";

export const WEIGHTED_DIRECT_PREVIEW_VERSION = "clo-weighted-direct-preview-v1";
export type DirectScope = {
  programmeId: string; offeringId: string; courseSpecId: string; cloId: string;
};
type AssessmentScope = DirectScope & { enrollmentId: string; assessmentItemId: string };
export type EvidenceKind = "criterion" | "question" | "whole-assessment";
export type Attribution = "individual" | "individual-contribution" | "shared-group";
export type PlannedComponent = {
  id: string; maxScore: number; role: "direct" | "supporting"; attribution: Attribution;
};
export type InstrumentIdentity = {
  kind: EvidenceKind; instrumentId: string; instrumentHash: string;
  // Exam adapters bind this to the exact assignment/revision/paper, not a default paper.
  assignmentKey: string | null;
  // Whole-assessment evidence is admissible only with an explicitly exclusive CLO.
  exclusiveCloId: string | null;
};
export type ExpectedAssessment = {
  assessmentItemId: string; cloWeight: number | null;
};
export type AssessmentPlan = {
  assessmentItemId: string; mapping: "mapped" | "not-mapped" | "unresolved";
  instrument: InstrumentIdentity | null; components: readonly PlannedComponent[];
};
export type ReleasedAssessment = {
  scope: AssessmentScope; instrument: InstrumentIdentity;
  sourceResultId: string; sourceRevisionId: string;
  release: "published-finalized";
  // Source adapter must verify the complete original instrument, release and attribution.
  verified: true;
  scores: readonly { componentId: string; scoreId: string; score: number | null }[];
};
export type StudentEvidence = {
  enrollmentId: string; plans: readonly AssessmentPlan[]; results: readonly ReleasedAssessment[];
};
export type WeightedDirectInput = {
  scope: DirectScope; policy: CandidatePolicy;
  // Exact expected assessment/roster inventories, loaded on the server. No guessed
  // grade weights, no implicit omission of ungraded assessments or enrollments.
  assessments: readonly ExpectedAssessment[];
  enrollmentIds: readonly string[];
  students: readonly StudentEvidence[];
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function fail(message: string): never { throw new Error(message); }
function key(value: string): string {
  if (typeof value !== "string" || !value.trim()) fail("Missing evidence identity");
  return value;
}
function unique<T>(rows: readonly T[], id: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const k = key(id(row));
    if (result.has(k)) fail("Duplicate evidence identity");
    result.set(k, row);
  }
  return result;
}
function sameKeys<T, U>(a: Map<string, T>, b: Map<string, U>) {
  return a.size === b.size && [...a.keys()].every(k => b.has(k));
}
function positive(value: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value) || value <= 0 || value > maximum) fail("Invalid positive maximum or weight");
  return value;
}
function instrumentIdentity(value: InstrumentIdentity, scope: DirectScope): InstrumentIdentity {
  if (!["criterion", "question", "whole-assessment"].includes(value.kind)) fail("Invalid instrument kind");
  key(value.instrumentId); key(value.instrumentHash);
  if (value.kind === "question") {
    if (value.assignmentKey === null) fail("Missing exact paper assignment");
    key(value.assignmentKey);
  } else if (value.assignmentKey !== null) fail("Unexpected paper assignment");
  if (value.kind === "whole-assessment") {
    if (value.exclusiveCloId !== scope.cloId) fail("Whole assessment requires exclusive CLO mapping");
  } else if (value.exclusiveCloId !== null) fail("Unexpected exclusive CLO mapping");
  return { kind: value.kind, instrumentId: value.instrumentId, instrumentHash: value.instrumentHash,
    assignmentKey: value.assignmentKey, exclusiveCloId: value.exclusiveCloId };
}

/**
 * Internal calculation-only candidate preview. No database calls, route, grading,
 * policy activation or official snapshot write. Caller must independently verify
 * authorized canonical sources, roster, complete instrument and mapping inventories.
 * Do not consume exam draft previews as released evidence.
 */
export function calculateWeightedDirectPreview(input: WeightedDirectInput) {
  const { policy } = input;
  const scope = { programmeId: key(input.scope.programmeId), offeringId: key(input.scope.offeringId),
    courseSpecId: key(input.scope.courseSpecId), cloId: key(input.scope.cloId) };
  if (policy.programmeId !== scope.programmeId || policy.status !== "candidate" || policy.activationAllowed !== false)
    fail("Candidate policy scope mismatch");
  candidateDirectLevel(null, policy.band);
  const policyRef = { referenceId: key(policy.referenceId), referenceRevision: policy.referenceRevision,
    calculationVersion: policy.calculationVersion, band: policy.band, individualThreshold: policy.individualThreshold };
  if (!Number.isSafeInteger(policyRef.referenceRevision) || policyRef.referenceRevision < 1 || policyRef.individualThreshold !== 60)
    fail("Invalid candidate policy reference");

  const inventory = unique(input.assessments, a => a.assessmentItemId);
  for (const a of inventory.values()) if (a.cloWeight !== null) positive(a.cloWeight, 100);
  const roster = unique(input.enrollmentIds, id => id);
  const studentsById = unique(input.students, s => s.enrollmentId);
  if (!sameKeys(roster, studentsById)) fail("Roster and evidence population mismatch");
  const directResultIds = new Set<string>();
  const directScoreIds = new Set<string>();

  const students = [...studentsById.values()].sort((a,b) => compare(a.enrollmentId,b.enrollmentId)).map(student => {
    const plans = unique(student.plans, p => p.assessmentItemId);
    const results = unique(student.results, r => r.scope.assessmentItemId);
    if (!sameKeys(inventory, plans)) fail("Incomplete expected assessment inventory");
    for (const id of results.keys()) if (!plans.has(id)) fail("Unexpected assessment result");

    const assessments = [...inventory.values()].sort((a,b) => compare(a.assessmentItemId,b.assessmentItemId)).map(assessment => {
      const id = assessment.assessmentItemId;
      const plan = plans.get(id)!;
      const result = results.get(id);
      const weight = assessment.cloWeight;
      if (plan.mapping === "not-mapped" || plan.mapping === "unresolved") {
        if (plan.instrument !== null || plan.components.length || result) fail("Unexpected evidence for unmapped or unresolved assessment");
        return { assessmentItemId: id, weight, state: plan.mapping, instrument: null,
          sourceResultId: null, sourceRevisionId: null, components: [], earned: null, maximum: null, fraction: null };
      }
      if (plan.mapping !== "mapped" || !plan.instrument || !plan.components.length) fail("Invalid mapped evidence plan");
      const instrument = instrumentIdentity(plan.instrument, scope);
      const components = unique(plan.components, c => c.id);
      for (const c of components.values()) {
        positive(c.maxScore);
        if (!["direct","supporting"].includes(c.role) || !["individual","individual-contribution","shared-group"].includes(c.attribution))
          fail("Invalid component mapping");
        if (c.role === "direct" && c.attribution === "shared-group") fail("Shared group score is not individual direct evidence");
      }
      if (instrument.kind === "whole-assessment" && (components.size !== 1 || [...components.values()][0]!.role !== "direct"))
        fail("Invalid whole-assessment evidence");
      const direct = [...components.values()].filter(c => c.role === "direct").sort((a,b) => compare(a.id,b.id));
      if (direct.length && weight === null) fail("Explicit CLO weight required for direct assessment");
      const scores = unique(result?.scores ?? [], s => s.componentId);
      if (result) {
        const s = result.scope;
        if (s.programmeId !== scope.programmeId || s.offeringId !== scope.offeringId ||
            s.courseSpecId !== scope.courseSpecId || s.cloId !== scope.cloId ||
            s.enrollmentId !== student.enrollmentId || s.assessmentItemId !== id ||
            JSON.stringify(instrumentIdentity(result.instrument, scope)) !== JSON.stringify(instrument))
          fail("Result scope or instrument version mismatch");
        if (result.release !== "published-finalized" || result.verified !== true) fail("Unreleased or unverified result");
        key(result.sourceResultId); key(result.sourceRevisionId);
        unique(result.scores, s => s.scoreId);
        for (const score of scores.values()) {
          const expected = components.get(score.componentId);
          if (!expected) fail("Unexpected score component");
          if (score.score !== null && (!Number.isFinite(score.score) || score.score < 0 || score.score > expected.maxScore))
            fail("Invalid component score");
          if (expected.role === "direct") {
            if (directScoreIds.has(score.scoreId)) fail("Duplicate direct score attribution");
            directScoreIds.add(score.scoreId);
          }
        }
        if (direct.length) {
          if (directResultIds.has(result.sourceResultId)) fail("Duplicate direct result attribution");
          directResultIds.add(result.sourceResultId);
        }
      }
      const trace = [...components.values()].sort((a,b) => compare(a.id,b.id)).map(c => ({
        componentId: c.id, maxScore: c.maxScore, role: c.role, attribution: c.attribution,
        scoreId: scores.get(c.id)?.scoreId ?? null, score: scores.get(c.id)?.score ?? null,
      }));
      const complete = direct.length > 0 && direct.every(c => scores.get(c.id)?.score != null);
      const maximum = direct.length ? direct.reduce((sum,c) => sum+c.maxScore,0) : null;
      const earned = complete ? direct.reduce((sum,c) => sum+scores.get(c.id)!.score!,0) : null;
      const fraction = earned !== null && maximum !== null ? earned / maximum : null;
      return { assessmentItemId: id, weight, instrument, components: trace,
        state: !direct.length ? "supporting-only" as const : complete ? "complete" as const : "missing" as const,
        sourceResultId: result?.sourceResultId ?? null, sourceRevisionId: result?.sourceRevisionId ?? null,
        earned, maximum, fraction };
    });
    const expected = assessments.filter(a => a.state === "complete" || a.state === "missing");
    const completed = expected.filter(a => a.state === "complete");
    const expectedWeight = expected.reduce((n,a) => n+(a.weight ?? 0),0);
    const completedWeight = completed.reduce((n,a) => n+(a.weight ?? 0),0);
    const unresolved = assessments.some(a => a.state === "unresolved");
    // No partial classification, no silent reweighting of missing assessments.
    const complete = !unresolved && expected.length > 0 && completed.length === expected.length;
    const percentage = complete ? completed.reduce((n,a) => n+a.fraction!*a.weight!,0)/expectedWeight*100 : null;
    // Clamp only a floating point overshoot at the mathematical upper bound.
    const score = percentage === null ? null : Math.min(100, percentage);
    return { enrollmentId: student.enrollmentId, assessments, expectedWeight, completedWeight,
      status: unresolved ? "unresolved" as const : !expected.length ? "no-direct-evidence" as const :
        complete ? "complete" as const : "incomplete" as const,
      percentage: score, attained: candidateStudentAttained(score) };
  });

  // Same population semantics as #1385 and immutable QA snapshot count contract.
  const population = candidatePopulation({ populationSize: roster.size,
    studentCount: students.filter(s => s.percentage !== null).length,
    achievedCount: students.filter(s => s.attained === true).length });
  // Different direct assessment coverage across resolved papers is a comparability
  // blocker, not permission to silently publish a section-level classification.
  const signatures = new Set(students.filter(s => s.status !== "unresolved").map(s =>
    JSON.stringify(s.assessments.filter(a => a.state === "complete" || a.state === "missing").map(a => a.assessmentItemId))));
  const comparableAssessmentCoverage = signatures.size <= 1 && students.every(s => s.status !== "unresolved");
  const sourceEvidence = { calculationVersion: WEIGHTED_DIRECT_PREVIEW_VERSION, scope, policyRef,
    assessments: [...inventory.values()].sort((a,b) => compare(a.assessmentItemId,b.assessmentItemId))
      .map(a => ({ assessmentItemId: a.assessmentItemId, cloWeight: a.cloWeight })),
    students, population, comparableAssessmentCoverage,
    directLevel: candidateDirectLevel(comparableAssessmentCoverage ? population.completePopulationRate : null, policy.band),
    official: false as const };
  return { ...sourceEvidence, calculationHash: createHash("sha256").update(JSON.stringify(sourceEvidence)).digest("hex") };
}
