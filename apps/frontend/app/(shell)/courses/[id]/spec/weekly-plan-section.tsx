"use client";

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FolderKanban,
  Info,
  Pencil,
  Plus,
  Timer,
  Trash2,
} from "lucide-react";
import { Button } from "@dse-pms/ui";
import type { CloForm } from "./clos-section";
import {
  cloChip,
  cloColor,
  cloCoverage,
  cloSltAllocation,
  weekContactHoursForm,
  weekSltForm,
  weeklyPlanFormTotals,
  weeklyPlanSummary,
  type CloCoverage,
  type WeeklyPlanForm,
} from "./weekly-plan-model";
import { WeekFormModal } from "./weekly-plan/week-form-modal";

// Re-exported so the wizard keeps importing the weekly-plan model from this section.
export {
  EMPTY_WEEKLY_PLAN,
  toWeeklyPlanForm,
  toWeeklyPlanPayload,
  type WeeklyPlanForm,
} from "./weekly-plan-model";

export function WeeklyPlanSectionForm({
  value,
  onChange,
  courseName,
  clos = [],
}: {
  value: WeeklyPlanForm;
  onChange: (v: WeeklyPlanForm) => void;
  courseName?: string;
  /** §14 CLOs, for the modal's "Link CLOs" picker and the coverage sidebar. */
  clos?: CloForm[];
}) {
  const cloCodes = clos.map((c) => c.code);
  const [modal, setModal] = useState<{ open: boolean; weekId: string | null }>({
    open: false,
    weekId: null,
  });
  const openAdd = () => setModal({ open: true, weekId: null });
  const openEdit = (weekId: string) => setModal({ open: true, weekId });

  const totals = weeklyPlanFormTotals(value);
  const totalContactHours =
    totals.lectureHours +
    totals.tutorialHours +
    totals.practiceHours +
    totals.otherHours;

  const remove = (id: string) => {
    const w = value.find((x) => x.id === id);
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete week ${w?.week}? This can't be undone.`)
    ) {
      return;
    }
    onChange(value.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Weekly Plan</h2>
          <p className="text-sm text-muted-foreground">
            Plan weekly topics, learning activities, SLT and link to CLOs
            {courseName ? ` for ${courseName}` : ""}.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Week
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Table */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Weekly Plan ({value.length}{" "}
              {value.length === 1 ? "Week" : "Weeks"})
            </h3>
          </div>

          {value.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No weeks planned yet.
              </p>
              <button
                type="button"
                onClick={openAdd}
                className="mt-1 text-sm font-medium text-accent-foreground hover:underline"
              >
                + Add your first week
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[1060px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                    <th className="w-14 px-3 py-2.5">Week</th>
                    <th className="px-3 py-2.5">Topic / Content</th>
                    <th className="px-3 py-2.5">CLOs</th>
                    <th className="px-3 py-2.5">Learning Activities</th>
                    <th className="px-3 py-2.5">LLOs</th>
                    <th className="px-3 py-2.5 text-center">
                      Contact Hours (L+T+P+O)
                    </th>
                    <th className="px-3 py-2.5 text-center">
                      Self-Study Hours
                    </th>
                    <th className="px-3 py-2.5 text-center">SLT (Hours)</th>
                    <th className="px-3 py-2.5">Assessment / Deliverables</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {value.map((w) => (
                    <tr
                      key={w.id}
                      className="border-b border-border/70 align-top"
                    >
                      <td className="px-3 py-3">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-accent px-1.5 text-xs font-semibold text-accent-foreground">
                          {w.week || "—"}
                        </span>
                      </td>
                      <td className="max-w-[240px] px-3 py-3 font-medium text-foreground">
                        {w.topic || (
                          <span className="text-muted-foreground">
                            Untitled
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {w.cloCodes.length ? (
                            w.cloCodes.map((code) => (
                              <span
                                key={code}
                                className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${cloChip(code)}`}
                              >
                                {code}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[200px] px-3 py-3">
                        {w.activities.length ? (
                          <ul className="space-y-0.5">
                            {w.activities.map((a) => (
                              <li
                                key={a}
                                className="flex items-center gap-1.5 text-foreground"
                              >
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                {a}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-[220px] px-3 py-3">
                        {w.lloItems.length ? (
                          <ul className="space-y-0.5">
                            {w.lloItems.map((llo, i) => (
                              <li key={i} className="text-foreground">
                                <span className="font-medium text-muted-foreground">
                                  LLO{i + 1}:
                                </span>{" "}
                                {llo}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-foreground">
                        {weekContactHoursForm(w) || "—"}
                      </td>
                      <td className="px-3 py-3 text-center text-foreground">
                        {w.selfStudyHours || "—"}
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-foreground">
                        {weekSltForm(w)}
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {w.assessment || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label={`Edit week ${w.week}`}
                            onClick={() => openEdit(w.id)}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={`Delete week ${w.week}`}
                            danger
                            onClick={() => remove(w.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/40 text-sm font-semibold text-foreground">
                    <td colSpan={5} className="px-3 py-2.5">
                      Total ({value.length}{" "}
                      {value.length === 1 ? "Week" : "Weeks"})
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {totalContactHours}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {totals.selfStudyHours}
                    </td>
                    <td className="px-3 py-2.5 text-center">{totals.slt}</td>
                    <td colSpan={2} className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            SLT = Contact Hours (Lecture + Tutorial + Practice + Other) +
            Self-Study Hours
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <CloCoverageCard plan={value} cloCodes={cloCodes} />

          <SummaryCard plan={value} />
        </aside>
      </div>

      <WeekFormModal
        open={modal.open}
        onOpenChange={(open) => setModal((m) => ({ ...m, open }))}
        weekId={modal.weekId}
        weeks={value}
        clos={clos}
        onSave={onChange}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- CLO Coverage */

function CloCoverageCard({
  plan,
  cloCodes,
}: {
  plan: WeeklyPlanForm;
  cloCodes: string[];
}) {
  const coverage = cloCoverage(plan, cloCodes.length ? cloCodes : undefined);
  const allocations = cloSltAllocation(
    plan,
    cloCodes.length ? cloCodes : undefined,
  );

  const allocationByCode = new Map(
    allocations.map((item) => [item.code, item.sltHours]),
  );
  const totalClos = coverage.length;
  const coveredClos = coverage.filter((c) => c.weeks > 0).length;
  const percent = totalClos ? Math.round((coveredClos / totalClos) * 100) : 0;
  const courseSlt = weeklyPlanFormTotals(plan).slt;

  const allocatedSlt = allocations.reduce(
    (sum, item) => sum + item.sltHours,
    0,
  );

  const unallocatedSlt = Math.max(0, courseSlt - allocatedSlt);
  return (
    <Card>
      <CardHeader title="CLO Coverage" />
      {totalClos === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          Link CLOs to weeks to see coverage.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-5">
            <Donut coverage={coverage} percent={percent} />
            <ul className="flex-1 space-y-1.5 text-sm">
              {coverage.map((c) => (
                <li
                  key={c.code}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: cloColor(c.code) }}
                    />
                    {c.code}
                  </span>
                  <span className="text-right text-muted-foreground">
                    <span className="block">
                      {c.weeks} {c.weeks === 1 ? "Week" : "Weeks"}
                    </span>

                    <span className="block text-xs">
                      {(allocationByCode.get(c.code) ?? 0).toFixed(1)} h
                      allocated
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              percent === 100
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-border bg-muted/30 text-muted-foreground"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {percent === 100
              ? "All CLOs are covered in the weekly plan."
              : `${coveredClos} of ${totalClos} CLOs covered — ${totalClos - coveredClos} still unlinked.`}
          </div>
          <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Course SLT</span>
              <span className="font-medium text-foreground">
                {courseSlt.toFixed(1)} h
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Allocated to CLOs</span>
              <span className="font-medium text-foreground">
                {allocatedSlt.toFixed(1)} h
              </span>
            </div>

            {unallocatedSlt > 0 ? (
              <p className="mt-2 text-amber-700 dark:text-amber-300">
                {unallocatedSlt.toFixed(1)} h is not linked to any CLO.
              </p>
            ) : courseSlt > 0 ? (
              <p className="mt-2 text-emerald-700 dark:text-emerald-300">
                All planned SLT is allocated to CLOs.
              </p>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

/** SVG donut sized by each CLO's share of total covered weeks. */
function Donut({
  coverage,
  percent,
}: {
  coverage: CloCoverage[];
  percent: number;
}) {
  const size = 104;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const totalWeeks = coverage.reduce((sum, x) => sum + x.weeks, 0);

  let offset = 0;
  const segments =
    totalWeeks > 0
      ? coverage
          .filter((x) => x.weeks > 0)
          .map((x) => {
            const len = (x.weeks / totalWeeks) * c;
            const seg = { code: x.code, len, offset };
            offset += len;
            return seg;
          })
      : [];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {segments.map((s) => (
          <circle
            key={s.code}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={cloColor(s.code)}
            strokeWidth={stroke}
            strokeDasharray={`${s.len} ${c - s.len}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-foreground">{percent}%</span>
        <span className="text-[11px] text-muted-foreground">Covered</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Weekly Plan Summary */

function SummaryCard({ plan }: { plan: WeeklyPlanForm }) {
  const s = weeklyPlanSummary(plan);
  const projectRange =
    s.projectWeeks.length === 0
      ? null
      : s.projectWeeks.length === 1
        ? `Week ${s.projectWeeks[0]}`
        : `Week ${s.projectWeeks[0]}-${s.projectWeeks[s.projectWeeks.length - 1]}`;

  return (
    <Card>
      <CardHeader title="Weekly Plan Summary" />
      <dl className="space-y-2.5 text-sm">
        <SummaryRow
          icon={<CalendarDays className="h-4 w-4" />}
          label="Total Weeks"
          value={s.totalWeeks}
        />
        <SummaryRow
          icon={<Clock className="h-4 w-4" />}
          label="Total Contact Hours (L+T+P+O)"
          value={s.contactHours}
        />
        <SummaryRow
          icon={<Timer className="h-4 w-4" />}
          label="Total Self-Study Hours"
          value={s.selfStudyHours}
        />
        <SummaryRow
          icon={<Clock className="h-4 w-4" />}
          label="Total SLT Hours"
          value={s.slt}
        />
        <SummaryRow
          icon={<ClipboardList className="h-4 w-4" />}
          label="Assessments"
          value={s.assessments}
        />
        <SummaryRow
          icon={<FolderKanban className="h-4 w-4" />}
          label="Project Weeks"
          value={
            projectRange ? `${s.projectWeeks.length} (${projectRange})` : 0
          }
        />
      </dl>
    </Card>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="text-muted-foreground/80">{icon}</span>
        {label}
      </span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------- shared */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      {children}
    </section>
  );
}

function CardHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {action}
    </div>
  );
}

function IconButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted ${
        danger
          ? "text-status-live hover:border-status-live/40"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
