import { beforeAll, describe, expect, test } from "bun:test";
import {
  QA_CRITERIA_1_4_8_DATASET_VERSION,
  QaEvaluationDifficultySchema,
  QaEvaluationScenarioTypeSchema,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  QA_CONTROLLED_DATASET_EXPECTED_SCENARIOS,
  QA_CONTROLLED_SCENARIO_TYPES,
  exportQaCriteria148Dataset,
  initializeQaCriteria148Dataset,
} from "./controlled-dataset.ts";
import { setQaEvaluationGold } from "./service.ts";

const runDbTests = process.env.QA_CONTROLLED_DATASET_DB_TESTS === "1";
const describeDb = runDbTests ? describe : describe.skip;

describeDb("Criteria 1/4/8 controlled QA dataset", () => {
  beforeAll(async () => {
    await initializeQaCriteria148Dataset();
  });

  test("creates a balanced versioned scenario catalogue without operational records", async () => {
    const exported = await exportQaCriteria148Dataset();

    expect(exported.schemaVersion).toBe("qa-controlled-dataset-v1");
    expect(exported.datasetVersion).toBe(QA_CRITERIA_1_4_8_DATASET_VERSION);
    expect(exported.scenarioCount).toBe(QA_CONTROLLED_DATASET_EXPECTED_SCENARIOS);
    expect(exported.scenarios).toHaveLength(QA_CONTROLLED_DATASET_EXPECTED_SCENARIOS);

    const byRequirement = new Map<string, Set<string>>();
    for (const scenario of exported.scenarios) {
      QaEvaluationScenarioTypeSchema.parse(scenario.scenarioType);
      QaEvaluationDifficultySchema.parse(scenario.difficulty);
      expect(scenario.scenarioVersion).toBe(1);
      expect(scenario.datasetVersion).toBe(QA_CRITERIA_1_4_8_DATASET_VERSION);
      expect(scenario.goldApplicability).toBeNull();
      expect(scenario.goldState).toBeNull();
      expect(scenario.goldReviewerId).toBeNull();

      const types = byRequirement.get(scenario.requirementCode) ?? new Set<string>();
      types.add(scenario.scenarioType);
      byRequirement.set(scenario.requirementCode, types);

      for (const evidence of scenario.evidence) {
        expect(evidence.entityType).toBe("ControlledEvaluationEvidence");
        expect(evidence.scope.programmeId).toBe("controlled-evaluation");
        expect(evidence.referenceKey.startsWith(`${QA_CRITERIA_1_4_8_DATASET_VERSION}:`)).toBe(true);
        expect(evidence.provenance.ownerUnit).toBe("Controlled research dataset");
        expect(evidence.provenance.sourceUri).toBeNull();
        expect(evidence.goldRelevant).toBeNull();
      }
    }

    expect([...byRequirement.keys()].sort()).toEqual(["1.2", "4.1", "8.3"]);
    for (const types of byRequirement.values()) {
      expect([...types].sort()).toEqual([...QA_CONTROLLED_SCENARIO_TYPES].sort());
    }
  });

  test("initialization is idempotent and export is deterministic", async () => {
    const first = await initializeQaCriteria148Dataset();
    expect(first.created).toBe(0);
    expect(first.total).toBe(QA_CONTROLLED_DATASET_EXPECTED_SCENARIOS);

    const exportA = await exportQaCriteria148Dataset();
    const exportB = await exportQaCriteria148Dataset();
    expect(JSON.stringify(exportA)).toBe(JSON.stringify(exportB));
    expect(JSON.stringify(exportA)).not.toContain("exportedAt");
  });

  test("gold labels are added only through the human annotation workflow with reviewer provenance", async () => {
    const reviewer = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const before = await exportQaCriteria148Dataset();
    const scenario = before.scenarios.find(
      (item) => item.requirementCode === "1.2" && item.scenarioType === "positiveEvidence",
    );
    if (!scenario) throw new Error("Expected controlled positive-evidence scenario");

    const annotated = await setQaEvaluationGold(
      scenario.id,
      {
        goldApplicability: "applicable",
        goldState: "evidenceIdentified",
        note: "Human expert gold annotation for controlled dataset verification.",
        evidenceJudgments: scenario.evidence.map((item) => ({
          evidenceId: item.id,
          relevant: true,
        })),
      },
      reviewer.id,
    );

    expect(annotated.goldReviewerId).toBe(reviewer.id);
    expect(annotated.goldAnnotatedAt).not.toBeNull();
    expect(annotated.goldApplicability).toBe("applicable");
    expect(annotated.goldState).toBe("evidenceIdentified");
    expect(annotated.evidence.every((item) => item.goldRelevant === true)).toBe(true);

    const persisted = await exportQaCriteria148Dataset();
    const persistedScenario = persisted.scenarios.find((item) => item.id === scenario.id);
    expect(persistedScenario?.goldReviewerId).toBe(reviewer.id);
    expect(persistedScenario?.goldState).toBe("evidenceIdentified");
  });
});
