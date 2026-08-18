from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"anchor not found exactly once in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))

# Persist structured reasoning factors without disturbing Prisma's existing generated model.
Path("apps/backend/prisma/migrations/20260818060000_add_qa_analysis_reasoning_factors/migration.sql").parent.mkdir(parents=True, exist_ok=True)
Path("apps/backend/prisma/migrations/20260818060000_add_qa_analysis_reasoning_factors/migration.sql").write_text('''-- Issue #308: reproducible structured deterministic reasoning snapshot.\nALTER TABLE "QaEvidenceAnalysis"\n  ADD COLUMN "reasoningFactors" JSONB NOT NULL DEFAULT '{"evidence":[],"relationships":[]}'::jsonb;\n''')

# Shared analysis contract.
replace_once(
    "packages/shared-types/src/qa-analysis.ts",
    '''export const CreateQaEvidenceAnalysisSchema = z.object({''',
    '''export const QaEvidenceRelationshipReasoningStateSchema = z.enum(["satisfied", "gap", "ambiguous"]);\nexport const QaEvidenceReasoningFactorSchema = z.object({\n  expectedEvidenceId: z.string().trim().min(1).max(300),\n  evidenceType: z.string().trim().min(1).max(120),\n  role: z.enum(["required", "supportive", "context"]),\n  findingState: z.enum(["satisfied", "gap", "ambiguous"]),\n  acceptedCandidateKeys: z.array(z.string().max(500)).max(500).default([]),\n  rejectedScopeCount: z.number().int().min(0).default(0),\n  rejectedTemporalCount: z.number().int().min(0).default(0),\n  rejectedAuthorityCount: z.number().int().min(0).default(0),\n});\nexport const QaRelationshipReasoningFactorSchema = z.object({\n  fromEvidenceType: z.string().trim().min(1).max(120),\n  toEvidenceType: z.string().trim().min(1).max(120),\n  relation: z.enum(["supports", "derivedFrom", "reviewedBy", "resultsIn", "followedUpBy"]),\n  state: QaEvidenceRelationshipReasoningStateSchema,\n  matchedPairs: z.array(z.object({ fromCandidateKey: z.string().max(500), toCandidateKey: z.string().max(500) })).max(500).default([]),\n  explanation: z.string().trim().max(5000),\n});\nexport const QaAnalysisReasoningFactorsSchema = z.object({\n  evidence: z.array(QaEvidenceReasoningFactorSchema).max(100).default([]),\n  relationships: z.array(QaRelationshipReasoningFactorSchema).max(50).default([]),\n});\nexport type QaAnalysisReasoningFactors = z.infer<typeof QaAnalysisReasoningFactorsSchema>;\n\nexport const CreateQaEvidenceAnalysisSchema = z.object({''',
)
replace_once(
    "packages/shared-types/src/qa-analysis.ts",
    '''  promptVersion: z.string().trim().max(100).default(""),\n  sources: z.array(CreateQaEvidenceAnalysisSourceSchema).max(500).default([]),''',
    '''  promptVersion: z.string().trim().max(100).default(""),\n  reasoningFactors: QaAnalysisReasoningFactorsSchema.default({ evidence: [], relationships: [] }),\n  sources: z.array(CreateQaEvidenceAnalysisSourceSchema).max(500).default([]),''',
)
replace_once(
    "packages/shared-types/src/qa-analysis.ts",
    '''  promptVersion: string;\n  createdAt: string;''',
    '''  promptVersion: string;\n  reasoningFactors: QaAnalysisReasoningFactors;\n  createdAt: string;''',
)

# Analysis service reads/writes the raw JSONB compatibility column.
replace_once(
    "apps/backend/src/plugins/qa/analysis/service.ts",
    '''  QaApplicabilityStateSchema,\n  QaEvidenceAnalysisSourceKindSchema,''',
    '''  QaApplicabilityStateSchema,\n  QaAnalysisReasoningFactorsSchema,\n  QaEvidenceAnalysisSourceKindSchema,''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/service.ts",
    '''type AnalysisSemanticsRow = {\n  id: string;\n  applicability: string;\n  applicabilityReason: string;\n};''',
    '''type AnalysisSemanticsRow = {\n  id: string;\n  applicability: string;\n  applicabilityReason: string;\n  reasoningFactors: unknown;\n};''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/service.ts",
    '''    promptVersion: analysis.promptVersion,\n    createdAt: analysis.createdAt.toISOString(),''',
    '''    promptVersion: analysis.promptVersion,\n    reasoningFactors: QaAnalysisReasoningFactorsSchema.parse(semantics?.reasoningFactors ?? { evidence: [], relationships: [] }),\n    createdAt: analysis.createdAt.toISOString(),''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/service.ts",
    '''            "applicabilityReason" = ${input.applicabilityReason}\n        WHERE id = ${created.id}''',
    '''            "applicabilityReason" = ${input.applicabilityReason},\n            "reasoningFactors" = CAST(${JSON.stringify(input.reasoningFactors)} AS jsonb)\n        WHERE id = ${created.id}''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/service.ts",
    '''            "applicabilityReason" = ${input.applicabilityReason},\n            state = NULL''',
    '''            "applicabilityReason" = ${input.applicabilityReason},\n            "reasoningFactors" = CAST(${JSON.stringify(input.reasoningFactors)} AS jsonb),\n            state = NULL''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/service.ts",
    '''    SELECT id, applicability, "applicabilityReason"\n    FROM "QaEvidenceAnalysis"''',
    '''    SELECT id, applicability, "applicabilityReason", "reasoningFactors"\n    FROM "QaEvidenceAnalysis"''',
)

# Dedicated relationship evaluator: explicit IDs/references only; weak cases abstain.
Path("apps/backend/src/plugins/qa/analysis/relationships.ts").write_text('''import type {\n  QaEvidenceCandidateView,\n  QaEvidenceRelationshipLink,\n} from "@dse-pms/shared-types";\n\nexport type QaRelationshipFindingState = "satisfied" | "gap" | "ambiguous";\nexport interface QaRelationshipFinding {\n  link: QaEvidenceRelationshipLink;\n  state: QaRelationshipFindingState;\n  matchedPairs: Array<{ fromCandidateKey: string; toCandidateKey: string }>;\n  explanation: string;\n}\n\nfunction attr(candidate: QaEvidenceCandidateView, key: string): string | null {\n  const value = candidate.attributes[key];\n  if (typeof value === "string" && value.trim()) return value.trim();\n  return null;\n}\n\nfunction directIdProof(\n  from: QaEvidenceCandidateView, to: QaEvidenceCandidateView, fromKey: string, toKey: string,\n): boolean | null {\n  const left = attr(from, fromKey);\n  const right = attr(to, toKey);\n  if (!left || !right) return null;\n  return left === right;\n}\n\nfunction exactSharedScopeProof(from: QaEvidenceCandidateView, to: QaEvidenceCandidateView): boolean | null {\n  const keys = ["assessmentId", "offeringId", "courseSpecVersionId", "courseId", "cohortId"] as const;\n  let compared = 0;\n  for (const key of keys) {\n    const left = from.scope?.[key];\n    const right = to.scope?.[key];\n    if (!left || !right) continue;\n    compared += 1;\n    if (left !== right) return false;\n  }\n  return compared > 0 ? true : null;\n}\n\nfunction sourceReferenceProof(from: QaEvidenceCandidateView, to: QaEvidenceCandidateView): boolean | null {\n  const values = [attr(from, "sourceRefs"), attr(from, "sourceIds"), attr(from, "sourceAssessmentIds"), attr(from, "sourceResultIds")].filter((value): value is string => Boolean(value));\n  if (values.length === 0) return null;\n  const targets = new Set([to.entityId, to.key, attr(to, "assessmentId")].filter((value): value is string => Boolean(value)));\n  const tokens = values.flatMap((value) => value.split(/[;,]/).map((item) => item.trim()).filter(Boolean));\n  return tokens.some((token) => targets.has(token));\n}\n\nfunction pairProof(link: QaEvidenceRelationshipLink, from: QaEvidenceCandidateView, to: QaEvidenceCandidateView): boolean | null {\n  if (link.relation === "reviewedBy") return directIdProof(from, to, "analysisId", "analysisId");\n  if (link.relation === "resultsIn") return directIdProof(from, to, "reviewId", "reviewId");\n  if (link.relation === "followedUpBy") return directIdProof(from, to, "actionId", "actionId");\n  if (link.relation === "supports") return exactSharedScopeProof(from, to);\n  const referenced = sourceReferenceProof(from, to);\n  if (referenced !== null) return referenced;\n  return directIdProof(from, to, "assessmentId", "assessmentId");\n}\n\nexport function evaluateRelationship(\n  link: QaEvidenceRelationshipLink,\n  fromCandidates: QaEvidenceCandidateView[],\n  toCandidates: QaEvidenceCandidateView[],\n): QaRelationshipFinding {\n  if (fromCandidates.length === 0 || toCandidates.length === 0) {\n    return { link, state: "ambiguous", matchedPairs: [], explanation: `${link.relation}: relationship cannot be evaluated because one evidence side has no accepted candidate.` };\n  }\n  const matchedPairs: QaRelationshipFinding["matchedPairs"] = [];\n  let ambiguous = false;\n  let explicitMismatch = false;\n  for (const from of fromCandidates) {\n    let matched = false;\n    let fromAmbiguous = false;\n    let fromExplicitMismatch = false;\n    for (const to of toCandidates) {\n      const proof = pairProof(link, from, to);\n      if (proof === true) { matched = true; matchedPairs.push({ fromCandidateKey: from.key, toCandidateKey: to.key }); break; }\n      if (proof === false) fromExplicitMismatch = true;\n      if (proof === null) fromAmbiguous = true;\n    }\n    if (!matched) {\n      if (fromAmbiguous) ambiguous = true;\n      else if (fromExplicitMismatch) explicitMismatch = true;\n      else ambiguous = true;\n    }\n  }\n  if (matchedPairs.length === fromCandidates.length) {\n    return { link, state: "satisfied", matchedPairs, explanation: `${link.relation}: every accepted ${link.fromEvidenceType} candidate has a deterministic link to ${link.toEvidenceType}.` };\n  }\n  if (ambiguous) {\n    return { link, state: "ambiguous", matchedPairs, explanation: `${link.relation}: available candidates do not expose enough explicit relationship identity to prove every required link; human review is required.` };\n  }\n  return { link, state: "gap", matchedPairs, explanation: `${link.relation}: candidates expose explicit relationship identities, but at least one required source candidate does not link to the target evidence.` };\n}\n''')

# Rules consume relationship findings and bump deterministic version.
replace_once("apps/backend/src/plugins/qa/analysis/rules.ts", 'export const QA_DETERMINISTIC_RULE_VERSION = "1.0.0";', 'export const QA_DETERMINISTIC_RULE_VERSION = "2.0.0";')
replace_once(
    "apps/backend/src/plugins/qa/analysis/rules.ts",
    '''} from "@dse-pms/shared-types";''',
    '''} from "@dse-pms/shared-types";\nimport type { QaRelationshipFinding } from "./relationships.ts";''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/rules.ts",
    '''export function determineExpectationState(\n  requirementCode: string,\n  findings: QaEvidenceRuleFinding[],\n): { state: QaEvidenceAnalysisState; uncertaintyNote: string } {''',
    '''export function determineExpectationState(\n  requirementCode: string,\n  findings: QaEvidenceRuleFinding[],\n  relationships: QaRelationshipFinding[] = [],\n): { state: QaEvidenceAnalysisState; uncertaintyNote: string } {''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/rules.ts",
    '''  if (required.some((finding) => finding.state === "gap")) {''',
    '''  if (required.some((finding) => finding.state === "gap") || relationships.some((finding) => finding.state === "gap")) {''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/rules.ts",
    '''    required.some((finding) => finding.state === "ambiguous") ||\n    semanticExpertReviewRequirements.has(requirementCode)''',
    '''    required.some((finding) => finding.state === "ambiguous") ||\n    relationships.some((finding) => finding.state === "ambiguous") ||\n    semanticExpertReviewRequirements.has(requirementCode)''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/rules.ts",
    '''export function buildDeterministicExplanation(\n  requirementCode: string,\n  findings: QaEvidenceRuleFinding[],\n  state: QaEvidenceAnalysisState,\n): string {''',
    '''export function buildDeterministicExplanation(\n  requirementCode: string,\n  findings: QaEvidenceRuleFinding[],\n  state: QaEvidenceAnalysisState,\n  relationships: QaRelationshipFinding[] = [],\n): string {''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/rules.ts",
    '''  return `${headline} ${details}`.trim();''',
    '''  const relationshipDetails = relationships.map((finding) => `[relationship ${finding.link.relation}; ${finding.state}] ${finding.explanation}`).join(" ");\n  return `${headline} ${details} ${relationshipDetails}`.trim();''',
)

# Engine evaluates relationships after filtering and snapshots machine-readable factors.
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''  type QaEvidenceRuleFinding,\n} from "./rules.ts";''',
    '''  type QaEvidenceRuleFinding,\n} from "./rules.ts";\nimport { evaluateRelationship } from "./relationships.ts";''',
)
# Add reasoning factors to non-applicable runs.
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''          promptVersion: "",\n          sources: [],''',
    '''          promptVersion: "",\n          reasoningFactors: { evidence: [], relationships: [] },\n          sources: [],''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''    const { state, uncertaintyNote } = determineExpectationState(\n      requirementCode,\n      findings,\n    );''',
    '''    const acceptedByType = new Map(assessedGroups.map((group) => [group.finding.definition.evidenceType, group.finding.result.candidates]));\n    const relationshipFindings = expectation.relationshipRequirement.requiredLinks.map((link) =>\n      evaluateRelationship(link, acceptedByType.get(link.fromEvidenceType) ?? [], acceptedByType.get(link.toEvidenceType) ?? []),\n    );\n    const { state, uncertaintyNote } = determineExpectationState(\n      requirementCode,\n      findings,\n      relationshipFindings,\n    );\n    const reasoningFactors = {\n      evidence: assessedGroups.map((group) => ({\n        expectedEvidenceId: group.finding.definition.id,\n        evidenceType: group.finding.definition.evidenceType,\n        role: group.finding.definition.role,\n        findingState: group.finding.state,\n        acceptedCandidateKeys: group.finding.result.candidates.map((candidate) => candidate.key),\n        rejectedScopeCount: group.assessed.filter((item) => item.scopeMatch !== "exact").length,\n        rejectedTemporalCount: group.assessed.filter((item) => !temporalMatchSupportsEvidence(item.temporalRule, item.temporalMatch)).length,\n        rejectedAuthorityCount: group.assessed.filter((item) => item.authorityMatch !== true).length,\n      })),\n      relationships: relationshipFindings.map((finding) => ({\n        fromEvidenceType: finding.link.fromEvidenceType, toEvidenceType: finding.link.toEvidenceType, relation: finding.link.relation,\n        state: finding.state, matchedPairs: finding.matchedPairs, explanation: finding.explanation,\n      })),\n    };''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''        explanation: buildDeterministicExplanation(requirementCode, findings, state),''',
    '''        explanation: buildDeterministicExplanation(requirementCode, findings, state, relationshipFindings),''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''        promptVersion: "",\n        sources: sourceSnapshots''',
    '''        promptVersion: "",\n        reasoningFactors,\n        sources: sourceSnapshots''',
)

# Pure relationship and state regressions.
Path("apps/backend/src/plugins/qa/analysis/relationships.test.ts").write_text('''import { describe, expect, test } from "bun:test";\nimport type { QaEvidenceCandidateView } from "@dse-pms/shared-types";\nimport { evaluateRelationship } from "./relationships.ts";\nimport { determineExpectationState } from "./rules.ts";\n\nconst candidate = (key: string, evidenceType: string, attributes: Record<string, string> = {}, scope: QaEvidenceCandidateView["scope"] = { programmeId: "dse" }): QaEvidenceCandidateView => ({\n  key, sourceKind: "structuredCandidate", evidenceType, sourceDomain: "outcomes", title: key, summary: "", entityType: "Test", entityId: key, route: null, reportingDate: "2026-01-01T00:00:00.000Z", attributes, scope,\n});\n\nconst link = (relation: "reviewedBy" | "resultsIn" | "followedUpBy" | "supports" | "derivedFrom", fromEvidenceType = "from", toEvidenceType = "to") => ({ relation, fromEvidenceType, toEvidenceType });\n\ndescribe("research-grade evidence relationships", () => {\n  test("proves the Criterion 8 chain only through exact stored ids", () => {\n    expect(evaluateRelationship(link("reviewedBy"), [candidate("c", "from", { analysisId: "a1" })], [candidate("r", "to", { analysisId: "a1", reviewId: "r1" })]).state).toBe("satisfied");\n    expect(evaluateRelationship(link("resultsIn"), [candidate("r", "from", { reviewId: "r1" })], [candidate("x", "to", { reviewId: "r1", actionId: "x1" })]).state).toBe("satisfied");\n    expect(evaluateRelationship(link("followedUpBy"), [candidate("x", "from", { actionId: "x1" })], [candidate("f", "to", { actionId: "x1" })]).state).toBe("satisfied");\n  });\n\n  test("explicit mismatch is a relationship gap", () => {\n    expect(evaluateRelationship(link("reviewedBy"), [candidate("c", "from", { analysisId: "a1" })], [candidate("r", "to", { analysisId: "a2" })]).state).toBe("gap");\n  });\n\n  test("missing relationship identity abstains for expert review", () => {\n    const finding = evaluateRelationship(link("derivedFrom"), [candidate("a", "from")], [candidate("b", "to")]);\n    expect(finding.state).toBe("ambiguous");\n    const state = determineExpectationState("8.5", [], [finding]);\n    expect(state.state).toBe("expertReviewRequired");\n  });\n\n  test("supports can be established from exact shared academic scope", () => {\n    const scope = { programmeId: "dse", courseId: "c1", courseSpecVersionId: "s1", assessmentId: "a1" };\n    expect(evaluateRelationship(link("supports"), [candidate("m", "from", {}, scope)], [candidate("a", "to", {}, scope)]).state).toBe("satisfied");\n  });\n});\n''')
