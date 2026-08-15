import {
  rubricMaxLevelPoints,
  rubricScaleSummary,
  rubricTotalPoints,
  type Rubric,
} from "@dse-pms/shared-types";

export function RubricMatrix({ rubric }: { rubric: Rubric }) {
  const maxPoints = rubricMaxLevelPoints(rubric.levels);
  const total = rubricTotalPoints(rubric);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">Rubric Criteria</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rating scale: {rubricScaleSummary(rubric.levels)}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="min-w-[190px] px-4 py-3">Criteria</th>
              {rubric.levels.map((level, index) => (
                <th key={`${level.label}-${index}`} className="min-w-[180px] px-4 py-3 align-top">
                  <div className="font-semibold normal-case tracking-normal text-foreground">
                    {level.label}
                  </div>
                  <div className="mt-0.5 normal-case tracking-normal">{level.points} points</div>
                </th>
              ))}
              <th className="w-24 px-4 py-3 text-center">Points</th>
            </tr>
          </thead>
          <tbody>
            {rubric.criteria.map((criterion, criterionIndex) => (
              <tr key={criterion.id} className="border-b border-border/70 align-top last:border-0">
                <td className="px-4 py-4 font-medium text-foreground">
                  <span className="mr-1 text-muted-foreground">{criterionIndex + 1}.</span>
                  {criterion.name}
                </td>
                {rubric.levels.map((_level, levelIndex) => (
                  <td key={levelIndex} className="px-4 py-4 leading-6 text-muted-foreground">
                    {criterion.descriptors[levelIndex] || "—"}
                  </td>
                ))}
                <td className="px-4 py-4 text-center font-medium text-foreground">/{maxPoints}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30">
              <td
                colSpan={rubric.levels.length + 1}
                className="px-4 py-3 text-right font-semibold text-foreground"
              >
                Total
              </td>
              <td className="px-4 py-3 text-center text-base font-semibold text-foreground">/{total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
