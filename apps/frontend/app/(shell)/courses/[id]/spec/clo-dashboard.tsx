"use client";

import { useState } from "react";
import {
  AFFECTIVE_LEVELS,
  PSYCHOMOTOR_LEVELS,
} from "@dse-pms/shared-types";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  Info,
  Lightbulb,
  Target,
} from "lucide-react";
import {
  CAP_DOMAINS,
  BLOOM_COGNITIVE,
  capDomainCounts,
  type CloForm,
} from "./clo-model";

const GOOD_CLOS = [
  "Specific and clear",
  "Measurable and observable",
  "Aligned with PLOs",
  "Assessed through appropriate methods",
];

const QUICK_TIPS = [
  "Use action verbs from Bloom's Taxonomy.",
  "Focus on what students will be able to do.",
  "Ensure CLOs are aligned to PLOs.",
  "Limit the number of CLOs (3–7 is ideal).",
];

export function ClosDashboard({ clos }: { clos: CloForm[] }) {
  const total = clos.length;
  const mapped = clos.filter((c) => c.mappedPlos.length > 0).length;
  const notMapped = total - mapped;
  const coverage = total ? Math.round((mapped / total) * 100) : 0;
  const active = clos.filter((c) => c.status === "active").length;
  const inactive = total - active;
  const activePercent = total ? Math.round((active / total) * 100) : 0;

  const domainCounts = capDomainCounts(clos.map((clo) => clo.level));
  const distribution = CAP_DOMAINS.map((domain) => ({
    ...domain,
    count: domainCounts[domain.code],
  }));
  const classified = distribution.reduce(
    (sum, domain) => sum + domain.count,
    0,
  );
  const unclassifiedCount = domainCounts.unclassified;
  const segments = [
    ...distribution,
    ...(unclassifiedCount > 0
      ? [
          {
            code: "U",
            name: "Unclassified",
            dot: "#94a3b8",
            bar: "#94a3b8",
            chip: "",
            count: unclassifiedCount,
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* CLO Overview */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">CLO Overview</h3>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={ClipboardList} tint="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300" value={total} label="Total CLOs" />
          <StatTile icon={ClipboardCheck} tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" value={mapped} label="Mapped to PLOs" />
          <StatTile icon={FileWarning} tint="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" value={notMapped} label="Not Mapped" />
          <StatTile icon={Target} tint="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300" value={`${coverage}%`} label="Coverage" />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
            <h4 className="text-xs font-semibold text-foreground">
              C/A/P Domain Distribution
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {classified} of {total} classified
            </span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {total === 0
              ? null
              : segments
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <div
                      key={s.code}
                      style={{
                        width: `${(s.count / total) * 100}%`,
                        backgroundColor: s.bar,
                      }}
                      title={`${s.name}: ${s.count}`}
                    />
                  ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {segments.map((s) => (
              <li
                key={s.code}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: s.dot }}
                />
                {s.name} — {s.count} CLO{s.count === 1 ? "" : "s"} ·{" "}
                {total ? Math.round((s.count / total) * 100) : 0}%
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <h4 className="mb-2 text-xs font-semibold text-foreground">CLO Status</h4>
          <div className="flex items-center gap-5">
            <StatusRing value={active} percent={activePercent} />
            <dl className="space-y-1.5 text-sm">
              <StatusLegend color="#22c55e" label="Active" value={active} />
              <StatusLegend color="var(--muted-foreground)" label="Inactive" value={inactive} />
            </dl>
          </div>
        </div>
      </section>

      {/* What are CLOs? */}
      <section className="rounded-xl border border-border bg-sky-50/60 p-5 dark:bg-sky-950/20">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" /> What are CLOs?
        </h3>
        <p className="text-sm text-muted-foreground">
          Course Learning Outcomes (CLOs) describe what students are expected to learn and be able to
          do by the end of this course.
        </p>
        <p className="mt-3 text-sm font-medium text-foreground">Good CLOs are:</p>
        <ul className="mt-2 space-y-1.5">
          {GOOD_CLOS.map((g) => (
            <li key={g} className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> {g}
            </li>
          ))}
        </ul>
      </section>

      {/* Quick Tips */}
      <QuickTips />
    </div>
  );
}

function QuickTips() {
  const [showLevels, setShowLevels] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-amber-50/60 p-5 dark:bg-amber-950/20">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lightbulb className="h-4 w-4 text-amber-500" /> Quick Tips
      </h3>
      <ul className="space-y-2">
        {QUICK_TIPS.map((t) => (
          <li key={t} className="flex gap-2 text-sm text-muted-foreground">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" /> {t}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setShowLevels((v) => !v)}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300/70 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100/60 dark:text-amber-300 dark:hover:bg-amber-900/30"
      >
        <BookOpen className="h-4 w-4" /> View C/A/P Taxonomy
      </button>
      {showLevels ? (
        <div className="mt-3 space-y-3 text-xs text-muted-foreground">
          {CAP_DOMAINS.map((domain) => {
            const levels =
              domain.code === "C"
                ? BLOOM_COGNITIVE
                : domain.code === "A"
                  ? AFFECTIVE_LEVELS
                  : PSYCHOMOTOR_LEVELS;
            return (
              <div key={domain.code}>
                <p className="mb-1 font-semibold text-foreground">
                  {domain.name} ({domain.code})
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {levels.map((level) => (
                    <li
                      key={level.code}
                      className="rounded-full border border-border bg-background/50 px-2 py-0.5"
                    >
                      <span className="font-semibold text-foreground">
                        {level.code}
                      </span>{" "}
                      {level.name}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function StatTile({
  icon: Icon,
  tint,
  value,
  label,
}: {
  icon: typeof Target;
  tint: string;
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <span className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="text-xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusRing({ value, percent }: { value: number; percent: number }) {
  const size = 88;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - percent / 100);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#22c55e"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-foreground">{value}</span>
        <span className="text-[10px] font-medium text-emerald-600">{percent}%</span>
      </div>
    </div>
  );
}

function StatusLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-8">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
