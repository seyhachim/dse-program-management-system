import { describe, expect, test } from "bun:test";
import type { QaEvidenceCandidateView } from "@dse-pms/shared-types";
import { evaluateRelationship } from "./relationships.ts";
import { determineExpectationState } from "./rules.ts";

const candidate = (key: string, evidenceType: string, attributes: Record<string, string> = {}, scope: QaEvidenceCandidateView["scope"] = { programmeId: "dse" }): QaEvidenceCandidateView => ({
  key, sourceKind: "structuredCandidate", evidenceType, sourceDomain: "outcomes", title: key, summary: "", entityType: "Test", entityId: key, route: null, reportingDate: "2026-01-01T00:00:00.000Z", attributes, scope,
});

const link = (relation: "reviewedBy" | "resultsIn" | "followedUpBy" | "supports" | "derivedFrom", fromEvidenceType = "from", toEvidenceType = "to") => ({ relation, fromEvidenceType, toEvidenceType });

describe("research-grade evidence relationships", () => {
  test("proves the Criterion 8 chain only through exact stored ids", () => {
    expect(evaluateRelationship(link("reviewedBy"), [candidate("c", "from", { analysisId: "a1" })], [candidate("r", "to", { analysisId: "a1", reviewId: "r1" })]).state).toBe("satisfied");
    expect(evaluateRelationship(link("resultsIn"), [candidate("r", "from", { reviewId: "r1" })], [candidate("x", "to", { reviewId: "r1", actionId: "x1" })]).state).toBe("satisfied");
    expect(evaluateRelationship(link("followedUpBy"), [candidate("x", "from", { actionId: "x1" })], [candidate("f", "to", { actionId: "x1" })]).state).toBe("satisfied");
  });

  test("explicit mismatch is a relationship gap", () => {
    expect(evaluateRelationship(link("reviewedBy"), [candidate("c", "from", { analysisId: "a1" })], [candidate("r", "to", { analysisId: "a2" })]).state).toBe("gap");
  });

  test("missing relationship identity abstains for expert review", () => {
    const finding = evaluateRelationship(link("derivedFrom"), [candidate("a", "from")], [candidate("b", "to")]);
    expect(finding.state).toBe("ambiguous");
    const state = determineExpectationState("8.5", [], [finding]);
    expect(state.state).toBe("expertReviewRequired");
  });

  test("supports can be established from exact shared academic scope", () => {
    const scope = { programmeId: "dse", courseId: "c1", courseSpecVersionId: "s1", assessmentId: "a1" };
    expect(evaluateRelationship(link("supports"), [candidate("m", "from", {}, scope)], [candidate("a", "to", {}, scope)]).state).toBe("satisfied");
  });
});
