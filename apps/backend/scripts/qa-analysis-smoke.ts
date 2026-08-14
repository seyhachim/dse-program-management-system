// Temporary branch-only smoke test; removed before merge.
import { AUN_QA_V4_ID } from "@dse-pms/shared-types";
import { prisma } from "../src/core/db/prisma.ts";
import {
  QaAnalysisScopeMismatchError,
  createQaEvidenceAnalysis,
  listQaEvidenceAnalyses,
} from "../src/plugins/qa/analysis/service.ts";

const framework = await prisma.qaFramework.findUniqueOrThrow({
  where: { id: AUN_QA_V4_ID },
  select: { id: true },
});
const requirement = await prisma.qaRequirement.findFirstOrThrow({
  where: { code: "1.2", criterion: { frameworkId: framework.id } },
  include: { expectations: { where: { active: true }, orderBy: { order: "asc" } } },
});
const otherRequirement = await prisma.qaRequirement.findFirstOrThrow({
  where: { code: "1.1", criterion: { frameworkId: framework.id } },
  include: { expectations: { where: { active: true }, orderBy: { order: "asc" } } },
});
const expectation = requirement.expectations[0];
const wrongExpectation = otherRequirement.expectations[0];
if (!expectation || !wrongExpectation) throw new Error("Pilot expectations were not seeded");

const cycle = await prisma.qaAssessmentCycle.create({
  data: {
    programmeId: "dse",
    frameworkId: framework.id,
    title: "Issue 187 provenance smoke test",
    reportingStart: new Date("2026-01-01T00:00:00.000Z"),
    reportingEnd: new Date("2026-12-31T00:00:00.000Z"),
    status: "Active",
  },
});

try {
  const source = {
    sourceKind: "structuredCandidate" as const,
    candidateKey: "clo-plo-mappings:CourseSpec:smoke-spec",
    sourceDomain: "courseSpec" as const,
    entityType: "CourseSpec",
    entityId: "smoke-spec",
    qaEvidenceId: null,
    title: "Smoke course — CLO to PLO mapping",
    summary: "Snapshot retained for provenance validation.",
    excerpt: "CLO1 maps to PLO2.",
    route: "/courses/smoke/spec",
    reportingDate: new Date("2026-06-01T00:00:00.000Z"),
    relevance: 0.95,
  };

  const first = await createQaEvidenceAnalysis({
    programmeId: "dse",
    cycleId: cycle.id,
    requirementCode: "1.2",
    expectationId: expectation.id,
    state: "evidenceIdentified",
    explanation: "First append-only analysis run.",
    confidence: 0.9,
    uncertaintyNote: "",
    engine: "smoke-deterministic",
    engineVersion: "1",
    sources: [source],
  });

  const second = await createQaEvidenceAnalysis({
    programmeId: "dse",
    cycleId: cycle.id,
    requirementCode: "1.2",
    expectationId: expectation.id,
    state: "expertReviewRequired",
    explanation: "Second run remains separate from the first.",
    confidence: 0.55,
    uncertaintyNote: "A reviewer should inspect the supporting context.",
    engine: "smoke-deterministic",
    engineVersion: "2",
    sources: [{ ...source, summary: "Second-run snapshot of the same source identity." }],
  });

  if (first.id === second.id) throw new Error("Re-analysis overwrote the previous run");

  const history = await listQaEvidenceAnalyses("dse", cycle.id, "1.2");
  if (history.length !== 2) throw new Error(`Expected 2 analysis runs, got ${history.length}`);
  const firstStored = history.find((item) => item.id === first.id);
  const secondStored = history.find((item) => item.id === second.id);
  if (!firstStored || !secondStored) throw new Error("Analysis history did not retain both run ids");
  if (firstStored.state !== "evidenceIdentified") throw new Error("First run state was overwritten");
  if (firstStored.sources[0]?.summary !== "Snapshot retained for provenance validation.") {
    throw new Error("First source snapshot was overwritten by re-analysis");
  }
  if (secondStored.sources[0]?.summary !== "Second-run snapshot of the same source identity.") {
    throw new Error("Second source snapshot was not retained");
  }

  let scopeRejected = false;
  try {
    await createQaEvidenceAnalysis({
      programmeId: "dse",
      cycleId: cycle.id,
      requirementCode: "1.2",
      expectationId: wrongExpectation.id,
      state: "expertReviewRequired",
      explanation: "This should be rejected because expectation and requirement differ.",
      confidence: null,
      uncertaintyNote: "",
      engine: "smoke-deterministic",
      engineVersion: "bad-scope",
      sources: [],
    });
  } catch (error) {
    scopeRejected = error instanceof QaAnalysisScopeMismatchError;
  }
  if (!scopeRejected) throw new Error("Mismatched expectation/requirement scope was not rejected");

  console.log("Issue 187 append-only analysis/provenance smoke test passed.");
} finally {
  await prisma.qaAssessmentCycle.delete({ where: { id: cycle.id } });
  await prisma.$disconnect();
}
