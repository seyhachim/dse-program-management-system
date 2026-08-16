// Temporary branch-only smoke test; removed before merge.
import { AUN_QA_V4_ID } from "@dse-pms/shared-types";
import { prisma } from "../src/core/db/prisma.ts";
import {
  QaEvaluationIntegrityError,
  QaEvaluationScopeMismatchError,
  createQaEvaluationHumanRating,
  createQaEvaluationRun,
  createQaEvaluationScenario,
  exportQaEvaluationData,
  getQaEvaluationMetrics,
  setQaEvaluationGold,
} from "../src/plugins/qa/evaluation/service.ts";

const suffix = Date.now().toString(36);
const reviewerId = crypto.randomUUID();
const engine = `qa-evaluation-smoke-${suffix}`;

await prisma.user.create({
  data: {
    id: reviewerId,
    email: `qa193-${suffix}@example.com`,
    name: "QA Research Evaluation Smoke Reviewer",
  },
});

const requirement = await prisma.qaRequirement.findFirstOrThrow({
  where: { code: "1.2", criterion: { frameworkId: AUN_QA_V4_ID } },
  include: { expectations: { where: { active: true }, orderBy: { order: "asc" } } },
});
const expectation = requirement.expectations[0];
if (!expectation) throw new Error("Pilot expectation 1.2 was not seeded");

const scenarioIds: string[] = [];

try {
  const complete = await createQaEvaluationScenario({
    requirementCode: "1.2",
    expectationId: expectation.id,
    name: `Complete evidence ${suffix}`,
    description: "Controlled scenario with one relevant CLO-PLO map and one irrelevant contextual record.",
    evidence: [
      {
        sourceDomain: "courseSpec",
        entityType: "ControlledCloPloMap",
        label: "Complete CLO-PLO map",
        text: "Every active CLO is mapped to at least one active PLO with approved mapping rationale.",
        referenceKey: `complete:${suffix}:mapping`,
        reportingDate: new Date("2026-06-01T00:00:00Z"),
      },
      {
        sourceDomain: "minutes",
        entityType: "ControlledMeetingMinutes",
        label: "Unrelated meeting minutes",
        text: "The meeting discussed room scheduling and did not address CLO-PLO alignment.",
        referenceKey: `complete:${suffix}:minutes`,
        reportingDate: new Date("2026-05-01T00:00:00Z"),
      },
    ],
  });
  scenarioIds.push(complete.id);

  const goldComplete = await setQaEvaluationGold(
    complete.id,
    {
      goldState: "evidenceIdentified",
      note: "Human reference classification: relevant alignment evidence is present.",
      evidenceJudgments: [
        { evidenceId: complete.evidence[0]!.id, relevant: true },
        { evidenceId: complete.evidence[1]!.id, relevant: false },
      ],
    },
    reviewerId,
  );
  if (goldComplete.goldReviewerId !== reviewerId || goldComplete.goldState !== "evidenceIdentified") {
    throw new Error("Human gold annotation was not persisted with reviewer provenance");
  }

  let overwriteBlocked = false;
  try {
    await setQaEvaluationGold(
      complete.id,
      {
        goldState: "potentialEvidenceGap",
        note: "This overwrite must be rejected.",
        evidenceJudgments: [],
      },
      reviewerId,
    );
  } catch (error) {
    overwriteBlocked = error instanceof QaEvaluationIntegrityError;
  }
  if (!overwriteBlocked) throw new Error("Human gold annotation could be overwritten");

  const completeRun = await createQaEvaluationRun({
    scenarioId: complete.id,
    predictedState: "evidenceIdentified",
    engine,
    engineVersion: "1.0.0",
    promptVersion: "qa-evidence-match-v1",
    explanation: "The controlled CLO-PLO mapping directly supports the expectation.",
    retrievedEvidence: [
      { scenarioEvidenceId: complete.evidence[0]!.id, relevance: 0.98 },
    ],
  });

  const gap = await createQaEvaluationScenario({
    requirementCode: "1.2",
    expectationId: expectation.id,
    name: `Missing evidence ${suffix}`,
    description: "Controlled scenario where no supporting CLO-PLO alignment evidence is available.",
    evidence: [],
  });
  scenarioIds.push(gap.id);

  await setQaEvaluationGold(
    gap.id,
    {
      goldState: "potentialEvidenceGap",
      note: "Human reference classification: supporting alignment evidence cannot be established.",
      evidenceJudgments: [],
    },
    reviewerId,
  );

  await createQaEvaluationRun({
    scenarioId: gap.id,
    predictedState: "expertReviewRequired",
    engine,
    engineVersion: "1.0.0",
    promptVersion: "qa-evidence-match-v1",
    explanation: "The prototype conservatively referred the no-evidence case for expert review.",
    retrievedEvidence: [],
  });

  let crossScenarioBlocked = false;
  try {
    await createQaEvaluationRun({
      scenarioId: gap.id,
      predictedState: "evidenceIdentified",
      engine,
      engineVersion: "scope-test",
      promptVersion: "",
      explanation: "This run must not be allowed to borrow evidence from another scenario.",
      retrievedEvidence: [
        { scenarioEvidenceId: complete.evidence[0]!.id, relevance: 0.5 },
      ],
    });
  } catch (error) {
    crossScenarioBlocked = error instanceof QaEvaluationScopeMismatchError;
  }
  if (!crossScenarioBlocked) throw new Error("Cross-scenario evidence reference was accepted");

  await createQaEvaluationHumanRating(
    completeRun.id,
    {
      evidenceRelevance: 5,
      explanationClarity: 4,
      understandability: 4,
      usefulness: 5,
      traceability: 5,
      comment: "Relevant evidence and traceable explanation.",
    },
    reviewerId,
  );

  let duplicateRatingBlocked = false;
  try {
    await createQaEvaluationHumanRating(
      completeRun.id,
      {
        evidenceRelevance: 1,
        explanationClarity: 1,
        understandability: 1,
        usefulness: 1,
        traceability: 1,
        comment: "This second rating must not overwrite the first.",
      },
      reviewerId,
    );
  } catch (error) {
    duplicateRatingBlocked = error instanceof QaEvaluationIntegrityError;
  }
  if (!duplicateRatingBlocked) throw new Error("Duplicate reviewer rating was accepted");

  const metrics = await getQaEvaluationMetrics({ engine, engineVersion: "1.0.0" });
  if (metrics.labelledRuns !== 2) throw new Error(`Expected 2 labelled runs, got ${metrics.labelledRuns}`);
  if (metrics.accuracy !== 0.5) throw new Error(`Expected accuracy 0.5, got ${metrics.accuracy}`);
  if (metrics.expertReviewReferralRate !== 0.5) {
    throw new Error(`Expected expert referral rate 0.5, got ${metrics.expertReviewReferralRate}`);
  }
  if (metrics.evidenceRetrievalPrecision !== 1 || metrics.evidenceRetrievalRecall !== 1) {
    throw new Error("Relevant controlled evidence did not reproduce retrieval precision/recall of 1.0");
  }
  if (metrics.humanRatings.count !== 1 || metrics.humanRatings.usefulness !== 5) {
    throw new Error("Human evaluation ratings were not included in reproducible metrics");
  }

  const exported = await exportQaEvaluationData();
  if (exported.frameworkId !== AUN_QA_V4_ID) throw new Error("Evaluation export lost framework provenance");
  if (!scenarioIds.every((id) => exported.scenarios.some((scenario) => scenario.id === id))) {
    throw new Error("Research export omitted controlled scenarios");
  }
  if (!exported.runs.some((run) => run.id === completeRun.id)) {
    throw new Error("Research export omitted prototype run history");
  }

  console.log("Issue 193 research evaluation smoke test passed.");
} finally {
  await prisma.qaEvaluationScenario.deleteMany({ where: { id: { in: scenarioIds } } });
  await prisma.user.delete({ where: { id: reviewerId } });
  await prisma.$disconnect();
}
