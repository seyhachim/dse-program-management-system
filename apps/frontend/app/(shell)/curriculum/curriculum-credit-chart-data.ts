import type { ProgrammeCurriculumRead } from "@dse-pms/shared-types";

type CurriculumTotals = ProgrammeCurriculumRead["totals"];

export type CurriculumCreditDatum = {
  key: "core" | "basic" | "elective" | "specialization" | "moeysHeip";
  label: string;
  credits: number;
  sharePercent: number;
};

const CREDIT_CATEGORIES = [
  { key: "core", label: "Core", field: "coreCredits" },
  { key: "basic", label: "Basic", field: "basicCredits" },
  { key: "elective", label: "Elective", field: "electiveCredits" },
  {
    key: "specialization",
    label: "Specialization",
    field: "specializationCredits",
  },
  { key: "moeysHeip", label: "MoEYS / HEIP", field: "moeysHeipCredits" },
] as const satisfies ReadonlyArray<{
  key: CurriculumCreditDatum["key"];
  label: string;
  field: keyof CurriculumTotals;
}>;

export function buildCurriculumCreditChartData(
  totals: CurriculumTotals,
): CurriculumCreditDatum[] {
  const denominator = totals.programmeCredits;

  return CREDIT_CATEGORIES.flatMap(({ key, label, field }) => {
    const credits = totals[field];
    if (credits <= 0) return [];

    return [
      {
        key,
        label,
        credits,
        sharePercent:
          denominator > 0 ? Math.round((credits / denominator) * 1000) / 10 : 0,
      },
    ];
  });
}
