// Temporary branch-only smoke test; removed before merge.
import { QA_LLM_PROMPT_VERSION, QA_PILOT_SCENARIO_VERSION } from "@dse-pms/shared-types";
import { prisma } from "../src/core/db/prisma.ts";
import type { QaLlmMessage, QaLlmProvider } from "../src/plugins/qa/analysis/llm-provider.ts";
import { createQaEvaluationHumanRating, listQaEvaluationScenarios, setQaEvaluationGold } from "../src/plugins/qa/evaluation/service.ts";
import { exportQaPilotData, getQaPilotMetrics } from "../src/plugins/qa/evaluation/pilot-metrics.ts";
import { initializeQaPilotScenarios } from "../src/plugins/qa/evaluation/pilot-scenarios.ts";
import {
  QaPilotReferenceRequiredError,
  getQaPilotStatus,
  runDeterministicQaPilotScenario,
  runLlmQaPilotScenario,
} from "../src/plugins/qa/evaluation/pilot-runner.ts";

const prefix = `${QA_PILOT_SCENARIO_VERSION}:`;
const reviewer = await prisma.user.findUniqueOrThrow({ where: { email: "qa@dse.dev" } });

try {
  await prisma.qaEvaluationScenario.deleteMany({ where: { name: { startsWith: prefix } } });

  const firstInit = await initializeQaPilotScenarios();
  if (firstInit.created !== 28 || firstInit.total !== 28) {
    throw new Error(`Expected 28 newly initialized pilot scenarios, got ${JSON.stringify(firstInit)}`);
  }
  const secondInit = await initializeQaPilotScenarios();
  if (secondInit.created !== 0 || secondInit.existing !== 28) {
    throw new Error("Pilot scenario initialization is not idempotent");
  }

  let status = await getQaPilotStatus();
  if (status.scenarioCount !== 28 || !status.allRequirementsCovered || status.goldAnnotatedCount !== 0) {
    throw new Error(`Initial pilot status is invalid: ${JSON.stringify(status)}`);
  }

  const scenarios = (await listQaEvaluationScenarios()).filter((scenario) => scenario.name.startsWith(prefix));
  const byName = new Map(scenarios.map((scenario) => [scenario.name, scenario]));
  const oneTwoA = byName.get(`${QA_PILOT_SCENARIO_VERSION}:1.2:A`)!;
  const oneTwoB = byName.get(`${QA_PILOT_SCENARIO_VERSION}:1.2:B`)!;
  const oneOneA = byName.get(`${QA_PILOT_SCENARIO_VERSION}:1.1:A`)!;
  if (!oneTwoA || !oneTwoB || !oneOneA) throw new Error("Required controlled pilot scenarios are missing");

  let preGoldBlocked = false;
  try {
    await runDeterministicQaPilotScenario(oneTwoA.id);
  } catch (error) {
    preGoldBlocked = error instanceof QaPilotReferenceRequiredError;
  }
  if (!preGoldBlocked) throw new Error("Prototype prediction was allowed before the expert reference label");

  async function lockGold(
    scenario: typeof oneTwoA,
    state: "evidenceIdentified" | "potentialEvidenceGap" | "expertReviewRequired",
    note: string,
  ) {
    return setQaEvaluationGold(
      scenario.id,
      {
        goldState: state,
        note,
        evidenceJudgments: scenario.evidence.map((evidence) => ({ evidenceId: evidence.id, relevant: true })),
      },
      reviewer.id,
    );
  }

  await lockGold(oneTwoA, "evidenceIdentified", "Expert reference: the supplied CLO-PLO evidence is sufficient and traceable.");
  await lockGold(oneTwoB, "potentialEvidenceGap", "Expert reference: the supplied CLO-PLO mapping is incomplete for one active CLO.");
  await lockGold(oneOneA, "expertReviewRequired", "Expert reference: the outcome evidence requires academic interpretation before a conclusion.");

  const run12A = await runDeterministicQaPilotScenario(oneTwoA.id);
  const run12B = await runDeterministicQaPilotScenario(oneTwoB.id);
  const run11A = await runDeterministicQaPilotScenario(oneOneA.id);
  if (run12A.predictedState !== "evidenceIdentified") throw new Error("1.2 A did not produce Evidence identified");
  if (run12B.predictedState !== "potentialEvidenceGap") throw new Error("1.2 B did not produce Potential evidence gap");
  if (run11A.predictedState !== "expertReviewRequired") throw new Error("1.1 A did not route to Expert review required");

  class FakePilotProvider implements QaLlmProvider {
    readonly model = "fake-pilot-llm-v1";
    async completeJson(messages: QaLlmMessage[]) {
      const userPayload = messages.find((message) => message.role === "user")?.content ?? "";
      if (userPayload.includes("goldState") || userPayload.includes("goldRelevant") || userPayload.includes("goldNote")) {
        throw new Error("Human reference classification leaked into the LLM prompt");
      }
      const parsed = JSON.parse(userPayload) as { candidates: Array<{ key: string }> };
      const key = parsed.candidates[0]?.key;
      if (!key) throw new Error("Expected controlled evidence candidate in fake LLM prompt");
      return {
        state: "expertReviewRequired",
        explanation: "The controlled evidence is relevant, but academic interpretation is required before the relationship to the expectation can be established conclusively.",
        confidence: 0.76,
        uncertaintyNote: "This is an evidence-coverage review state, not a quality score or accreditation decision.",
        usedCandidateKeys: [key],
      };
    }
  }

  const llmRun = await runLlmQaPilotScenario(oneOneA.id, new FakePilotProvider());
  if (llmRun.predictedState !== "expertReviewRequired" || llmRun.promptVersion !== QA_LLM_PROMPT_VERSION) {
    throw new Error("Controlled LLM pilot run lost state or prompt provenance");
  }

  await createQaEvaluationHumanRating(
    llmRun.id,
    {
      evidenceRelevance: 5,
      explanationClarity: 5,
      understandability: 4,
      usefulness: 5,
      traceability: 5,
      comment: "Smoke reviewer confirms the evaluation-rating workflow and exact-run provenance.",
    },
    reviewer.id,
  );

  status = await getQaPilotStatus();
  if (status.goldAnnotatedCount !== 3 || status.deterministicRunCount !== 3 || status.llmRunCount !== 1) {
    throw new Error(`Pilot run status counts are incorrect: ${JSON.stringify(status)}`);
  }
  if (status.readyForComparison) throw new Error("Pilot reported ready before all 28 expert references and prototype runs exist");

  const metrics = await getQaPilotMetrics();
  if (metrics.labelledRuns !== 4 || metrics.accuracy !== 1) {
    throw new Error(`Pilot metrics were not reproducible: ${JSON.stringify(metrics)}`);
  }
  if (metrics.humanRatings.count !== 1 || metrics.humanRatings.usefulness !== 5) {
    throw new Error("Pilot human study ratings were not included in metrics");
  }

  const exported = await exportQaPilotData();
  if (exported.scenarios.length !== 28 || exported.runs.length !== 4) {
    throw new Error("Pilot-only export did not preserve exactly the controlled pilot dataset");
  }
  if (!exported.scenarios.every((scenario) => scenario.name.startsWith(prefix))) {
    throw new Error("Pilot export included an unrelated evaluation scenario");
  }

  console.log("Issue 194 controlled AUN-QA pilot smoke test passed.");
} finally {
  await prisma.qaEvaluationScenario.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.$disconnect();
}
