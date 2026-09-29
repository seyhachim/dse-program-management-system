import { describe, expect, test } from "bun:test";
import type { ProgrammeCurriculumRead } from "@dse-pms/shared-types";
import { buildCurriculumCreditChartData } from "./curriculum-credit-chart-data";

type CurriculumTotals = ProgrammeCurriculumRead["totals"];

function totals(overrides: Partial<CurriculumTotals> = {}): CurriculumTotals {
  return {
    programmeCredits: 100,
    coreCredits: 50,
    basicCredits: 20,
    electiveCredits: 10,
    specializationCredits: 20,
    moeysHeipCredits: 0,
    ...overrides,
  };
}

describe("curriculum credit chart data", () => {
  test("projects canonical curriculum totals in a stable display order", () => {
    expect(buildCurriculumCreditChartData(totals())).toEqual([
      { key: "core", label: "Core", credits: 50, sharePercent: 50 },
      { key: "basic", label: "Basic", credits: 20, sharePercent: 20 },
      { key: "elective", label: "Elective", credits: 10, sharePercent: 10 },
      {
        key: "specialization",
        label: "Specialization",
        credits: 20,
        sharePercent: 20,
      },
    ]);
  });

  test("includes MoEYS / HEIP only when it contributes credits", () => {
    expect(
      buildCurriculumCreditChartData(
        totals({ programmeCredits: 110, moeysHeipCredits: 10 }),
      ).at(-1),
    ).toEqual({
      key: "moeysHeip",
      label: "MoEYS / HEIP",
      credits: 10,
      sharePercent: 9.1,
    });
  });

  test("does not create misleading bars for zero-value categories", () => {
    expect(
      buildCurriculumCreditChartData(
        totals({ electiveCredits: 0, specializationCredits: 0 }),
      ).map((item) => item.key),
    ).toEqual(["core", "basic"]);
  });
});
