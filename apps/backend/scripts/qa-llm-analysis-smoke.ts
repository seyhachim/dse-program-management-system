// Temporary branch-only smoke test; removed before merge.
import { AUN_QA_V4_ID, QA_LLM_PROMPT_VERSION } from "@dse-pms/shared-types";
import { prisma } from "../src/core/db/prisma.ts";
import {
  QaLlmOutputValidationError,
  QaLlmUnavailableError,
  runLlmAssistedQaAnalysis,
} from "../src/plugins/qa/analysis/llm-engine.ts";
import type { QaLlmMessage, QaLlmProvider } from "../src/plugins/qa/analysis/llm-provider.ts";
import { listQaEvidenceAnalyses } from "../src/plugins/qa/analysis/service.ts";

class FakeProvider implements QaLlmProvider {
  readonly model = "qa-fake-model-v1";
  constructor(private readonly output: unknown) {}
  async completeJson(messages: QaLlmMessage[]): Promise<unknown> {
    const system = messages.find((message) => message.role === "system")?.content ?? "";
    if (!system.includes("Do not assign") || !system.includes("evidence gap")) {
      throw new Error("Research guardrails were not present in the LLM system prompt");
    }
    return this.output;
  }
}

const suffix = Date.now().toString(36);
const programmeId = `qa-smoke-190-${suffix}`;
const cycleId = crypto.randomUUID();

await prisma.programme.create({
  data: { id: programmeId, code: `QA190-${suffix}`, name: "QA 190 LLM smoke programme" },
});
const requirement = await prisma.qaRequirement.findFirstOrThrow({
  where: { code: "1.5", criterion: { frameworkId: AUN_QA_V4_ID } },
  select: { id: true },
});
await prisma.qaAssessmentCycle.create({
  data: {
    id: cycleId,
    programmeId,
    frameworkId: AUN_QA_V4_ID,
    title: "Issue 190 LLM smoke cycle",
    reportingStart: new Date("2026-01-01T00:00:00Z"),
    reportingEnd: new Date("2026-12-31T00:00:00Z"),
    status: "Active",
  },
});
const evidence = await prisma.qaEvidence.create({
  data: {
    programmeId,
    cycleId,
    requirementId: requirement.id,
    title: "Programme outcome achievement report",
    description: "An internally reviewed report summarising graduate achievement of expected outcomes.",
    kind: "SystemLink",
    sourceRef: "qa-smoke:outcome-achievement",
    reportingPeriod: "2026",
    status: "Reviewed",
  },
});

try {
  let unavailable = false;
  try {
    await runLlmAssistedQaAnalysis(programmeId, cycleId, "1.5", null);
  } catch (error) {
    unavailable = error instanceof QaLlmUnavailableError;
  }
  if (!unavailable) throw new Error("Missing LLM provider did not fail closed");

  const candidateKey = `qa-evidence:${evidence.id}`;
  const good = new FakeProvider({
    state: "evidenceIdentified",
    explanation: "The manually attached outcome achievement report is relevant supporting evidence for the stated expectation; this is an evidence-matching finding only.",
    confidence: 0.82,
    uncertaintyNote: "Human QA review remains responsible for the final judgment.",
    usedCandidateKeys: [candidateKey],
  });
  const saved = await runLlmAssistedQaAnalysis(programmeId, cycleId, "1.5", good);
  if (saved[0]?.state !== "evidenceIdentified") throw new Error("Valid grounded LLM result was not persisted");
  if (saved[0]?.engine !== "llm-assisted" || saved[0]?.engineVersion !== good.model) {
    throw new Error("LLM model metadata was not persisted");
  }
  if (saved[0]?.promptVersion !== QA_LLM_PROMPT_VERSION) {
    throw new Error("LLM prompt version was not persisted");
  }
  if (saved[0]?.sources[0]?.qaEvidenceId !== evidence.id) {
    throw new Error("Used manual QA evidence provenance was not persisted");
  }

  let inventedRejected = false;
  try {
    await runLlmAssistedQaAnalysis(
      programmeId,
      cycleId,
      "1.5",
      new FakeProvider({
        state: "evidenceIdentified",
        explanation: "This response tries to cite evidence that was never supplied to the model context.",
        confidence: 0.9,
        uncertaintyNote: "",
        usedCandidateKeys: ["invented:candidate:key"],
      }),
    );
  } catch (error) {
    inventedRejected = error instanceof QaLlmOutputValidationError;
  }
  if (!inventedRejected) throw new Error("Invented LLM evidence candidate key was accepted");

  let scoreRejected = false;
  try {
    await runLlmAssistedQaAnalysis(
      programmeId,
      cycleId,
      "1.5",
      new FakeProvider({
        state: "evidenceIdentified",
        explanation: "The supplied evidence is relevant, therefore the AUN-QA rating is 5/7 for this requirement.",
        confidence: 0.9,
        uncertaintyNote: "",
        usedCandidateKeys: [candidateKey],
      }),
    );
  } catch (error) {
    scoreRejected = error instanceof QaLlmOutputValidationError;
  }
  if (!scoreRejected) throw new Error("Numeric AUN-QA rating output was accepted");

  const history = await listQaEvidenceAnalyses(programmeId, cycleId, "1.5");
  if (history.length !== 1) {
    throw new Error(`Rejected LLM outputs should not persist; expected 1 run, got ${history.length}`);
  }

  console.log("Issue 190 evidence-grounded LLM analysis smoke test passed.");
} finally {
  await prisma.qaAssessmentCycle.delete({ where: { id: cycleId } });
  await prisma.programme.delete({ where: { id: programmeId } });
  await prisma.$disconnect();
}
