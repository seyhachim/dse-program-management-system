import { QaEvidenceAnalysisStateSchema } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { calculateQaEvaluationMetrics } from "./metrics.ts";
import { QA_PILOT_SCENARIO_VERSION } from "@dse-pms/shared-types";

const fromDbState = {
  EvidenceIdentified: "evidenceIdentified",
  PotentialEvidenceGap: "potentialEvidenceGap",
  ExpertReviewRequired: "expertReviewRequired",
} as const;

export async function getQaPilotMetrics() {
  const pilotWhere = { scenario: { name: { startsWith: `${QA_PILOT_SCENARIO_VERSION}:` } } } as const;
  const [runs, ratings] = await Promise.all([
    prisma.qaEvaluationRun.findMany({
      where: pilotWhere,
      include: {
        scenario: { include: { evidence: { select: { id: true, goldRelevant: true } } } },
        retrieved: { include: { scenarioEvidence: { select: { goldRelevant: true } } } },
      },
    }),
    prisma.qaEvaluationHumanRating.findMany({
      where: { run: pilotWhere },
      select: {
        evidenceRelevance: true,
        explanationClarity: true,
        understandability: true,
        usefulness: true,
        traceability: true,
      },
    }),
  ]);

  return calculateQaEvaluationMetrics(
    runs.map((run) => ({
      predictedState: QaEvidenceAnalysisStateSchema.parse(
        fromDbState[run.predictedState as keyof typeof fromDbState],
      ),
      goldState: run.scenario.goldState
        ? QaEvidenceAnalysisStateSchema.parse(
            fromDbState[run.scenario.goldState as keyof typeof fromDbState],
          )
        : null,
      retrievedEvidence: run.retrieved.map((item) => ({
        goldRelevant: item.scenarioEvidence.goldRelevant,
      })),
      goldRelevantEvidenceCount: run.scenario.evidence.filter((item) => item.goldRelevant === true).length,
    })),
    ratings,
  );
}
