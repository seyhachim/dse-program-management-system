import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { getQaEvidenceCandidates } from "./service.ts";
import { recordProgrammeOutcomeIndicator } from "./programme-outcome-indicators.ts";

const enabled = process.env.PROGRAMME_INDICATOR_DB_TESTS === "1";
const db = new PrismaClient();
const cohortId = crypto.randomUUID();

const base = { programmeId: "dse", cohortId, indicatorType: "ProgressionRate" as const, definitionVersion: "progression-v1", definition: { numerator: "students progressed", denominator: "students with period status" }, calculationVersion: "calc-v1" };

describe.skipIf(!enabled)("programme outcome indicator integrity", () => {
  beforeAll(async () => {
    await db.studentCohort.create({ data: { id: cohortId, programmeId: "dse", code: `I304-${cohortId.slice(0,6)}`, name: "Indicator cohort", intakeYear: 2020, expectedGraduationYear: 2024, status: "Completed" } });
  });
  afterAll(async () => { await db.$disconnect(); });

  test("persists comparable indicator history with exact lineage", async () => {
    for (const [year, numerator] of [["2022-2023", 8], ["2023-2024", 9], ["2024-2025", 10]] as const) {
      await recordProgrammeOutcomeIndicator({ ...base, academicYear: year, periodKey: year, numerator, denominator: 10, sourceRefs: [`StudentProgressionRecord:${year}`] });
    }
    const evidence = await getQaEvidenceCandidates("dse", "aun-qa-v4:8.4:research:c8-e04:evidence:1");
    const rows = evidence.candidates.filter((item) => item.scope?.cohortId === cohortId);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((item) => item.attributes.definitionHash)).size).toBe(1);
    expect(rows.every((item) => item.provenance?.authority === "controlledInternalRecord")).toBe(true);
    expect(rows.map((item) => item.periodKey).sort()).toEqual(["2022-2023", "2023-2024", "2024-2025"]);
  });

  test("definition changes are separately visible and supersede same-period history", async () => {
    const changed = await recordProgrammeOutcomeIndicator({ ...base, academicYear: "2024-2025", periodKey: "2024-2025", numerator: 9, denominator: 10, definitionVersion: "progression-v2", definition: { numerator: "students advanced without retention", denominator: "all active cohort members" }, sourceRefs: ["StudentProgressionRecord:2024-2025:v2"] });
    expect(changed.supersedesIndicatorId).toBeTruthy();
    const definitions = await getQaEvidenceCandidates("dse", "aun-qa-v4:8.4:research:c8-e04:evidence:2");
    const versions = new Set(definitions.candidates.filter((item) => item.attributes.indicatorType === "ProgressionRate").map((item) => item.attributes.definitionVersion));
    expect(versions.has("progression-v1")).toBe(true);
    expect(versions.has("progression-v2")).toBe(true);
  });

  test("identical inputs are idempotent and historical rows are immutable", async () => {
    const input = { ...base, academicYear: "2023-2024", periodKey: "2023-2024", numerator: 9, denominator: 10, sourceRefs: ["StudentProgressionRecord:2023-2024"] };
    const first = await recordProgrammeOutcomeIndicator(input);
    const again = await recordProgrammeOutcomeIndicator(input);
    expect(again.id).toBe(first.id);
    let failed = false;
    try { await db.programmeOutcomeIndicator.update({ where: { id: first.id }, data: { numerator: 1 } }); } catch { failed = true; }
    expect(failed).toBe(true);
  });

  test("supports zero-denominator missing-population periods without inventing a rate", async () => {
    const missing = await recordProgrammeOutcomeIndicator({ ...base, indicatorType: "CompletionRate", academicYear: "2021-2022", periodKey: "2021-2022", numerator: 0, denominator: 0, definitionVersion: "completion-v1", definition: { numerator: "completed", denominator: "eligible mature cohort" }, sourceRefs: ["StudentCompletionOutcome:none"] });
    expect(missing.value).toBeNull();
  });
});
