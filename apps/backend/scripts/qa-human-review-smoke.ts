// Temporary branch-only smoke test; removed before merge.
import { AUN_QA_V4_ID } from "@dse-pms/shared-types";
import { prisma } from "../src/core/db/prisma.ts";
import { createQaEvidenceAnalysis } from "../src/plugins/qa/analysis/service.ts";
import {
  QaAnalysisReviewScopeMismatchError,
  createQaAnalysisReview,
  listQaAnalysisReviews,
} from "../src/plugins/qa/reviews/service.ts";

const suffix = Date.now().toString(36);
const programmeId = `qa-smoke-191-${suffix}`;
const otherProgrammeId = `qa-smoke-191-other-${suffix}`;
const reviewerId = crypto.randomUUID();
const cycleId = crypto.randomUUID();

await prisma.programme.createMany({
  data: [
    { id: programmeId, code: `QA191-${suffix}`, name: "QA 191 review smoke programme" },
    { id: otherProgrammeId, code: `QA191O-${suffix}`, name: "QA 191 other programme" },
  ],
});
await prisma.user.create({
  data: {
    id: reviewerId,
    email: `qa191-${suffix}@example.com`,
    name: "QA Review Smoke Expert",
  },
});
const requirement = await prisma.qaRequirement.findFirstOrThrow({
  where: { code: "1.2", criterion: { frameworkId: AUN_QA_V4_ID } },
  include: { expectations: { where: { active: true }, orderBy: { order: "asc" } } },
});
const expectation = requirement.expectations[0];
if (!expectation) throw new Error("Pilot expectation 1.2 was not seeded");
await prisma.qaAssessmentCycle.create({
  data: {
    id: cycleId,
    programmeId,
    frameworkId: AUN_QA_V4_ID,
    title: "Issue 191 human review smoke cycle",
    reportingStart: new Date("2026-01-01T00:00:00Z"),
    reportingEnd: new Date("2026-12-31T00:00:00Z"),
    status: "Active",
  },
});

try {
  const first = await createQaEvidenceAnalysis({
    programmeId,
    cycleId,
    requirementCode: "1.2",
    expectationId: expectation.id,
    state: "potentialEvidenceGap",
    explanation: "First analysis reports a potential evidence gap for human review.",
    confidence: null,
    uncertaintyNote: "This is not a quality judgment.",
    engine: "deterministic-rules",
    engineVersion: "1.0.0",
    promptVersion: "",
    sources: [],
  });

  const confirmed = await createQaAnalysisReview(
    first.id,
    { programmeId, decision: "confirmed", comment: "Initial expert confirmation." },
    reviewerId,
  );
  const moreEvidence = await createQaAnalysisReview(
    first.id,
    {
      programmeId,
      decision: "needsMoreEvidence",
      comment: "Please attach the signed curriculum review minutes before final judgment.",
    },
    reviewerId,
  );
  if (confirmed.id === moreEvidence.id) throw new Error("Review history overwrote an earlier decision");

  const second = await createQaEvidenceAnalysis({
    programmeId,
    cycleId,
    requirementCode: "1.2",
    expectationId: expectation.id,
    state: "evidenceIdentified",
    explanation: "Second re-analysis is a new immutable analysis version.",
    confidence: null,
    uncertaintyNote: "Human review remains separate.",
    engine: "deterministic-rules",
    engineVersion: "1.0.1",
    promptVersion: "",
    sources: [],
  });
  if (second.id === first.id) throw new Error("Re-analysis reused the original analysis id");

  const history = await listQaAnalysisReviews(programmeId, cycleId);
  if (history.length !== 2) throw new Error(`Expected 2 review history rows, got ${history.length}`);
  if (!history.every((review) => review.analysisId === first.id)) {
    throw new Error("Historical reviews migrated to a later analysis version");
  }
  if (history.some((review) => review.analysisId === second.id)) {
    throw new Error("Later re-analysis inherited a prior human review");
  }

  let scopeRejected = false;
  try {
    await createQaAnalysisReview(
      first.id,
      {
        programmeId: otherProgrammeId,
        decision: "rejected",
        comment: "This cross-programme review must not be accepted.",
      },
      reviewerId,
    );
  } catch (error) {
    scopeRejected = error instanceof QaAnalysisReviewScopeMismatchError;
  }
  if (!scopeRejected) throw new Error("Cross-programme human review was not rejected");

  const storedAnalysis = await prisma.qaEvidenceAnalysis.findUniqueOrThrow({ where: { id: first.id } });
  if (storedAnalysis.state !== "PotentialEvidenceGap") {
    throw new Error("Human review mutated the underlying evidence analysis state");
  }

  console.log("Issue 191 immutable human review smoke test passed.");
} finally {
  await prisma.qaAssessmentCycle.delete({ where: { id: cycleId } });
  await prisma.user.delete({ where: { id: reviewerId } });
  await prisma.programme.deleteMany({ where: { id: { in: [programmeId, otherProgrammeId] } } });
  await prisma.$disconnect();
}
