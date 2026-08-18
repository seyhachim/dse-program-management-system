import { expect, test } from "bun:test";
import type {
  QaEvidenceCandidateResultView,
  QaExpectedEvidenceDefinitionView,
} from "@dse-pms/shared-types";
import {
  QA_DETERMINISTIC_RULE_VERSION,
  applyExpectationCrossChecks,
  determineExpectationState,
  evaluateExpectedEvidence,
} from "./rules.ts";

function definition(
  evidenceType: string,
  role: QaExpectedEvidenceDefinitionView["role"] = "required",
): QaExpectedEvidenceDefinitionView {
  return {
    id: `e:${evidenceType}`,
    evidenceType,
    description: evidenceType,
    role,
    sourceDomain: "courseSpec",
    order: 1,
    scopeRequirement: { requiredDimensions: [] },
    temporalRule: { kind: "withinCycle" },
    authorityRequirement: { minimumAuthority: "unknown" },
  };
}

function result(
  evidenceType: string,
  candidates: QaEvidenceCandidateResultView["candidates"],
  status: QaEvidenceCandidateResultView["status"] = "supported",
): QaEvidenceCandidateResultView {
  return {
    programmeId: "dse",
    expectedEvidenceId: `e:${evidenceType}`,
    evidenceType,
    sourceDomain: "courseSpec",
    status,
    reason: status === "supported" ? "supported" : "deferred",
    candidates,
  };
}

function candidate(
  evidenceType: string,
  id: string,
  attributes: Record<string, string | number | boolean | null> = {},
) {
  return {
    key: `${evidenceType}:CourseSpec:${id}`,
    evidenceType,
    sourceDomain: "courseSpec" as const,
    title: id,
    summary: "candidate",
    entityType: "CourseSpec",
    entityId: id,
    route: null,
    reportingDate: null,
    attributes,
  };
}

test("deterministic rule engine is explicitly versioned", () => {
  expect(QA_DETERMINISTIC_RULE_VERSION).toBe("2.0.0");
});

test("supported required source with no candidates produces a potential evidence gap", () => {
  const finding = evaluateExpectedEvidence(
    definition("programme-outcomes"),
    result("programme-outcomes", []),
  );
  expect(finding.state).toBe("gap");
  expect(determineExpectationState("1.2", [finding]).state).toBe("potentialEvidenceGap");
});

test("unsupported required source routes to expert review instead of a gap", () => {
  const finding = evaluateExpectedEvidence(
    definition("clo-achievement"),
    result("clo-achievement", [], "unsupported"),
  );
  expect(finding.state).toBe("ambiguous");
  expect(determineExpectationState("1.5", [finding]).state).toBe("expertReviewRequired");
});

test("complete CLO to PLO mapping evidence can be identified deterministically", () => {
  const finding = evaluateExpectedEvidence(
    definition("clo-plo-mappings"),
    result("clo-plo-mappings", [
      candidate("clo-plo-mappings", "a", { activeClos: 3, mappedClos: 3 }),
      candidate("clo-plo-mappings", "b", { activeClos: 2, mappedClos: 2 }),
    ]),
  );
  expect(finding.state).toBe("satisfied");
  expect(determineExpectationState("1.2", [finding]).state).toBe("evidenceIdentified");
});

test("incomplete CLO to PLO mapping evidence produces a gap", () => {
  const finding = evaluateExpectedEvidence(
    definition("clo-plo-mappings"),
    result("clo-plo-mappings", [
      candidate("clo-plo-mappings", "a", { activeClos: 3, mappedClos: 2 }),
    ]),
  );
  expect(finding.state).toBe("gap");
});

test("supportive gaps do not override satisfied required evidence", () => {
  const required = evaluateExpectedEvidence(
    definition("programme-outcomes"),
    result("programme-outcomes", [candidate("programme-outcomes", "plo1")]),
  );
  const supportive = evaluateExpectedEvidence(
    definition("published-outcomes", "supportive"),
    result("published-outcomes", [], "unsupported"),
  );
  expect(determineExpectationState("2.4", [required, supportive]).state).toBe("evidenceIdentified");
});

test("semantic duty-to-qualification judgment remains expert review even when sources exist", () => {
  const staff = {
    definition: definition("staff-profile"),
    result: result("staff-profile", [candidate("staff-profile", "u1")]),
    state: "satisfied" as const,
    explanation: "staff profile found",
  };
  const assignment = {
    definition: definition("teaching-assignments"),
    result: result("teaching-assignments", [candidate("teaching-assignments", "o1")]),
    state: "satisfied" as const,
    explanation: "assignment found",
  };
  expect(determineExpectationState("5.4", [staff, assignment]).state).toBe("expertReviewRequired");
});

test("2.1 cross-check detects fewer approved specifications than programme courses", () => {
  const findings = applyExpectationCrossChecks("2.1", [
    {
      definition: definition("programme-structure"),
      result: result("programme-structure", [
        candidate("programme-structure", "c1"),
        candidate("programme-structure", "c2"),
      ]),
      state: "satisfied",
      explanation: "courses found",
    },
    {
      definition: definition("approved-course-specifications"),
      result: result("approved-course-specifications", [
        candidate("approved-course-specifications", "c1"),
      ]),
      state: "satisfied",
      explanation: "approved specs found",
    },
  ]);
  expect(findings[1]?.state).toBe("gap");
  expect(determineExpectationState("2.1", findings).state).toBe("potentialEvidenceGap");
});
