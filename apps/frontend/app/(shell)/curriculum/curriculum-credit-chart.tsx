"use client";

import type { ProgrammeCurriculumRead } from "@dse-pms/shared-types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildCurriculumCreditChartData } from "./curriculum-credit-chart-data";

type CurriculumTotals = ProgrammeCurriculumRead["totals"];

export function CurriculumCreditChart({ totals }: { totals: CurriculumTotals }) {
  const chartData = buildCurriculumCreditChartData(totals);

  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="curriculum-credit-chart-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h3 id="curriculum-credit-chart-title" className="font-semibold">
            Credit distribution
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Credits by course type for the selected curriculum version.
          </p>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {totals.programmeCredits} total credits
        </p>
      </div>

      {chartData.length > 0 ? (
        <>
          <div className="mt-5 h-64 w-full sm:h-72" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 4, left: 8 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={104}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    color: "var(--foreground)",
                  }}
                />
                <Bar
                  dataKey="credits"
                  name="Credits"
                  fill="var(--primary)"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {chartData.map((item) => (
              <div
                key={item.key}
                className="flex items-baseline justify-between gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className="text-right text-sm font-semibold">
                  {item.credits}
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({item.sharePercent}%)
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          No categorized curriculum credits are available for this version yet.
        </p>
      )}
    </section>
  );
}
