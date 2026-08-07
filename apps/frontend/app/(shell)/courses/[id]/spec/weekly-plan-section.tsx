"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import type { Method } from "@dse-pms/shared-types";
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
  onPersist,
  courseId,
  courseName,
  clos = [],
  teachingMethods = [],
  assessmentMethods = [],
}: {
  value: WeeklyPlanForm;
  onPersist: (v: WeeklyPlanForm) => Promise<boolean>;
  courseId: string;
  courseName?: string;
  clos?: CloForm[];
  teachingMethods?: Method[];
  assessmentMethods?: Method[];
}) {
  const cloCodes = clos.map((c) => c.code);

  const teachingMethodById = new Map(
    teachingMethods.map((method) => [method.id, method]),
  );

  const assessmentMethodById = new Map(
    assessmentMethods.map((method) => [method.id, method]),
  );

  const [modal, setModal] = useState<{
    open: boolean;
    weekId: string | null;
  }>({
    open: false,
    weekId: null,
  });

  const openAdd = () =>
    setModal({
      open: true,
      weekId: null,
    });

  const openEdit = (weekId: string) =>
    setModal({
      open: true,
      weekId,
    });

  const totals = weeklyPlanFormTotals(value);

  const totalContactHours =
    totals.lectureHours +
    totals.tutorialHours +
    totals.practiceHours +
    totals.otherHours;

  const remove = async (id: string) => {
    const week = value.find((item) => item.id === id);

    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete week ${week?.week}? This can't be undone.`)
    ) {
      return;
    }

    await onPersist(value.filter((item) => item.id !== id));
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
          <Plus className="mr-1.5 h-4 w-4" />
          Add Week
        </Button>
      </div>

      {/* Dashboard */}
      <WeeklyPlanDashboard plan={value} cloCodes={cloCodes} />

      {/* Weekly Plan Table */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />

          <h3 className="text-sm font-semibold text-foreground">
            Weekly Plan ({value.length} {value.length === 1 ? "Week" : "Weeks"})
          </h3>
        </div>

        {value.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <CalendarDays className="mx-auto h-9 w-9 text-muted-foreground/50" />

            <p className="mt-3 text-sm font-medium text-foreground">
              No weeks planned yet
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Add the first week to start building the weekly learning plan.
            </p>

            <Button size="sm" className="mt-4" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Week
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="w-16 px-3 py-2.5">Week</th>

                  <th className="min-w-[260px] px-3 py-2.5">
                    Topic & Outcomes
                  </th>

                  <th className="min-w-[260px] px-3 py-2.5">
                    Teaching & Learning
                  </th>

                  <th className="w-40 px-3 py-2.5">Time / SLT</th>

                  <th className="min-w-[180px] px-3 py-2.5">Assessment</th>

                  <th className="w-32 px-3 py-2.5">Attention</th>

                  <th className="w-20 px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {value.map((week) => {
                  const llos =
                    week.lessonLearningOutcomes.length > 0
                      ? week.lessonLearningOutcomes
                          .map((llo) => llo.description)
                          .filter(Boolean)
                      : week.lloItems.filter(Boolean);

                  const activities =
                    week.studentLearningActivities.length > 0
                      ? week.studentLearningActivities
                          .map((activity) => activity.title)
                          .filter(Boolean)
                      : week.activities.filter(Boolean);

                  const teaching = week.teachingMethodIds.map(
                    (methodId) =>
                      teachingMethodById.get(methodId)?.name ??
                      "Unknown method",
                  );

                  const assessments =
                    week.assessmentMethodIds.length > 0
                      ? week.assessmentMethodIds.map(
                          (methodId) =>
                            assessmentMethodById.get(methodId)?.name ??
                            "Unknown method",
                        )
                      : week.assessment
                        ? [week.assessment]
                        : [];

                  const attention = weekAttention(week);

                  return (
                    <tr
                      key={week.id}
                      className="border-b border-border/70 align-top last:border-b-0"
                    >
                      {/* Week */}
                      <td className="px-3 py-4">
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-accent px-2 text-xs font-semibold text-accent-foreground">
                          {week.week || "—"}
                        </span>
                      </td>

                      {/* Topic & Outcomes */}
                      <td className="px-3 py-4">
                        <p className="font-semibold text-foreground">
                          {week.topic || "Untitled week"}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {week.cloCodes.length > 0 ? (
                            week.cloCodes.map((code) => (
                              <span
                                key={code}
                                className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${cloChip(
                                  code,
                                )}`}
                              >
                                {code}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No CLO linked
                            </span>
                          )}
                        </div>

                        <CompactList
                          className="mt-2"
                          label="LLO"
                          items={llos}
                          empty="No lesson outcomes"
                          max={2}
                        />
                      </td>

                      {/* Teaching & Learning */}
                      <td className="px-3 py-4">
                        <CompactTags
                          label="Teaching"
                          items={teaching}
                          empty="No teaching method"
                        />

                        <CompactList
                          className="mt-3"
                          label="Activities"
                          items={activities}
                          empty="No learning activities"
                          max={2}
                        />
                      </td>

                      {/* Time */}
                      <td className="px-3 py-4">
                        <div className="space-y-1 text-xs">
                          <HourRow label="L" value={week.lectureHours} />

                          <HourRow label="T" value={week.tutorialHours} />

                          <HourRow label="P" value={week.practiceHours} />

                          <HourRow label="O" value={week.otherHours} />

                          <HourRow label="NF2F" value={week.selfStudyHours} />
                        </div>

                        <div className="mt-2 border-t border-border pt-2">
                          <span className="text-xs text-muted-foreground">
                            SLT
                          </span>{" "}
                          <span className="font-semibold text-foreground">
                            {weekSltForm(week)} h
                          </span>
                        </div>
                      </td>

                      {/* Assessment */}
                      <td className="px-3 py-4">
                        <CompactTags
                          items={assessments}
                          empty="No assessment"
                        />
                      </td>

                      {/* Attention */}
                      <td className="px-3 py-4">
                        {attention.length === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Complete
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {attention.length}{" "}
                              {attention.length === 1 ? "item" : "items"}
                            </span>

                            <p
                              className="mt-1.5 max-w-[150px] text-xs text-muted-foreground"
                              title={attention.join(", ")}
                            >
                              {attention.slice(0, 2).join(", ")}
                              {attention.length > 2 ? "…" : ""}
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label={`Edit week ${week.week}`}
                            onClick={() => openEdit(week.id)}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>

                          <IconButton
                            label={`Delete week ${week.week}`}
                            danger
                            onClick={() => remove(week.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t border-border bg-muted/40 text-sm font-semibold text-foreground">
                  <td colSpan={3} className="px-3 py-2.5">
                    Total ({value.length}{" "}
                    {value.length === 1 ? "Week" : "Weeks"})
                  </td>

                  <td className="px-3 py-2.5">
                    <span className="block text-xs font-normal text-muted-foreground">
                      Contact {totalContactHours} h · NF2F{" "}
                      {totals.selfStudyHours} h
                    </span>

                    <span>Total SLT {totals.slt} h</span>
                  </td>

                  <td colSpan={3} className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          SLT = Contact Hours (Lecture + Tutorial + Practice + Other) +
          Independent Learning Hours (NF2F)
        </div>
      </div>

      {/* Add / Edit Week Wizard */}
      <WeekFormModal
        open={modal.open}
        courseId={courseId}
        onOpenChange={(open) =>
          setModal((current) => ({
            ...current,
            open,
          }))
        }
        weekId={modal.weekId}
        weeks={value}
        clos={clos}
        teachingMethods={teachingMethods}
        assessmentMethods={assessmentMethods}
        onSave={onPersist}
      />
    </div>
  );
}

/* ================================================================
   Weekly Plan Dashboard
   ================================================================ */

function WeeklyPlanDashboard({
  plan,
  cloCodes,
}: {
  plan: WeeklyPlanForm;
  cloCodes: string[];
}) {
  const totals = weeklyPlanFormTotals(plan);

  const coverage = cloCoverage(plan, cloCodes.length ? cloCodes : undefined);

  const coveredClos = coverage.filter((item) => item.weeks > 0).length;

  const attentionWeeks = plan.filter((week) => weekAttention(week).length > 0);

  const completeWeeks = Math.max(0, plan.length - attentionWeeks.length);

  return (
    <div className="space-y-3">
      {/* Metrics */}
      <div
        className="grid gap-2.5"
        style={{
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        }}
      >
        <MetricCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Total Weeks"
          value={plan.length}
          detail="Weeks planned"
        />

        <MetricCard
          icon={<Clock className="h-4 w-4" />}
          label="Total SLT"
          value={`${totals.slt} h`}
          detail={`${totals.selfStudyHours} h independent`}
        />

        <MetricCard
          icon={<Target className="h-4 w-4" />}
          label="CLOs Covered"
          value={
            coverage.length > 0 ? `${coveredClos} / ${coverage.length}` : "—"
          }
          detail={
            coverage.length > 0
              ? `${Math.round((coveredClos / coverage.length) * 100)}% coverage`
              : "No CLOs available"
          }
        />

        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Need Attention"
          value={attentionWeeks.length}
          detail={attentionWeeks.length === 1 ? "Week" : "Weeks"}
          tone="attention"
        />

        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Complete"
          value={completeWeeks}
          detail={completeWeeks === 1 ? "Week" : "Weeks"}
          tone="complete"
        />
      </div>

      {/* Coverage + Attention */}
      <div
        className="grid items-start gap-3"
        style={{
          gridTemplateColumns: "minmax(0, 1.65fr) minmax(260px, 0.75fr)",
        }}
      >
        <CloCoverageOverview plan={plan} cloCodes={cloCodes} />

        <AttentionSummary plan={plan} />
      </div>
    </div>
  );
}

/* ================================================================
   Metric Card
   ================================================================ */

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone?: "default" | "attention" | "complete";
}) {
  const toneClasses =
    tone === "attention"
      ? "border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20"
      : tone === "complete"
        ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20"
        : "border-border bg-card";

  return (
    <div className={`min-w-0 rounded-xl border p-3 shadow-sm ${toneClasses}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
          {icon}
        </span>

        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {label}
          </p>

          <p className="mt-0.5 text-xl font-bold leading-none tracking-tight text-foreground">
            {value}
          </p>

          <p className="mt-1 truncate text-[10px] text-muted-foreground">
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   CLO Coverage
   ================================================================ */

function CloCoverageOverview({
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

  const maxAllocation = Math.max(
    1,
    ...allocations.map((item) => item.sltHours),
  );

  const totalSlt = weeklyPlanFormTotals(plan).slt;

  return (
    <Card>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">CLO Coverage</h3>

        <p className="mt-1 text-[11px] text-muted-foreground">
          Planned learning time and weekly coverage for each CLO.
        </p>
      </div>

      {coverage.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Link CLOs to weeks to see coverage.
          </p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div
            className="grid items-center gap-2 border-b border-border pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            style={{
              gridTemplateColumns: "52px minmax(0, 1fr) 105px 60px",
            }}
          >
            <span>CLO</span>
            <span>Coverage</span>
            <span>Weeks</span>
            <span className="text-right">SLT</span>
          </div>

          {/* Rows */}
          <div>
            {coverage.map((item) => {
              const hours = allocationByCode.get(item.code) ?? 0;

              const width =
                maxAllocation > 0
                  ? Math.min(100, (hours / maxAllocation) * 100)
                  : 0;

              const weeks = plan
                .filter((week) => week.cloCodes.includes(item.code))
                .map((week) => Number(week.week))
                .filter((week) => Number.isFinite(week) && week > 0)
                .sort((a, b) => a - b);

              return (
                <div
                  key={item.code}
                  className="grid items-center gap-2 border-b border-border/60 py-3 last:border-b-0"
                  style={{
                    gridTemplateColumns: "52px minmax(0, 1fr) 105px 60px",
                  }}
                >
                  {/* CLO */}
                  <span
                    className={`inline-flex w-fit rounded-md px-1.5 py-0.5 text-xs font-semibold ${cloChip(
                      item.code,
                    )}`}
                  >
                    {item.code}
                  </span>

                  {/* Coverage */}
                  <div className="min-w-0">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${width}%`,
                          backgroundColor: cloColor(item.code),
                        }}
                      />
                    </div>

                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {item.weeks > 0
                        ? `${item.weeks} ${
                            item.weeks === 1 ? "week" : "weeks"
                          } linked`
                        : "Not linked"}
                    </p>
                  </div>

                  {/* Weeks */}
                  <span className="text-[11px] text-muted-foreground">
                    {formatWeekRange(weeks)}
                  </span>

                  {/* SLT */}
                  <span className="text-right text-xs font-semibold text-foreground">
                    {hours.toFixed(1)} h
                  </span>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs font-semibold text-foreground">
              Total Student Learning Time
            </span>

            <span className="text-sm font-bold text-foreground">
              {totalSlt.toFixed(1)} h
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/* ================================================================
   Attention Summary
   ================================================================ */

function AttentionSummary({ plan }: { plan: WeeklyPlanForm }) {
  const grouped = new Map<string, number>();

  for (const week of plan) {
    for (const issue of weekAttention(week)) {
      grouped.set(issue, (grouped.get(issue) ?? 0) + 1);
    }
  }

  const issues = [...grouped.entries()].sort((a, b) => b[1] - a[1]);

  const attentionWeeks = plan.filter(
    (week) => weekAttention(week).length > 0,
  ).length;

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Needs Attention
          </h3>

          <p className="mt-1 text-[11px] text-muted-foreground">
            Missing planning information.
          </p>
        </div>

        {attentionWeeks > 0 ? (
          <span className="inline-flex shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {attentionWeeks} {attentionWeeks === 1 ? "week" : "weeks"}
          </span>
        ) : null}
      </div>

      {issues.length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />

            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              All planned weeks are complete.
            </span>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {issues.slice(0, 5).map(([issue, count]) => (
            <div
              key={issue}
              className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>

                <span className="truncate text-xs font-medium text-foreground">
                  {attentionLabel(issue)}
                </span>
              </div>

              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                {count} {count === 1 ? "week" : "weeks"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-blue-200/70 bg-blue-50/50 p-2.5 dark:border-blue-900/40 dark:bg-blue-950/20">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />

          <p className="text-[10px] leading-4 text-muted-foreground">
            Attention means planning information is incomplete. It does not
            indicate poor teaching quality or non-compliance.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ================================================================
   Derived Attention
   ================================================================ */

function weekAttention(week: WeeklyPlanForm[number]): string[] {
  const lloCount =
    week.lessonLearningOutcomes.filter((llo) => llo.description.trim())
      .length || week.lloItems.filter((llo) => llo.trim()).length;

  const activityCount =
    week.studentLearningActivities.filter((activity) => activity.title.trim())
      .length || week.activities.filter((activity) => activity.trim()).length;

  const issues: string[] = [];

  if (!week.topic.trim()) {
    issues.push("Topic");
  }

  if (week.cloCodes.length === 0) {
    issues.push("CLO");
  }

  if (lloCount === 0) {
    issues.push("LLO");
  }

  if (week.teachingMethodIds.length === 0) {
    issues.push("Teaching method");
  }

  if (activityCount === 0) {
    issues.push("Learning activity");
  }

  if (weekSltForm(week) <= 0) {
    issues.push("Learning time");
  }

  if (week.assessmentMethodIds.length === 0 && !week.assessment.trim()) {
    issues.push("Assessment");
  }

  return issues;
}

/* ================================================================
   Formatting Helpers
   ================================================================ */

function formatWeekRange(weeks: number[]): string {
  if (weeks.length === 0) {
    return "—";
  }

  if (weeks.length === 1) {
    return `Week ${weeks[0]}`;
  }

  const consecutive = weeks.every((week, index) => {
    if (index === 0) {
      return true;
    }

    const previous = weeks[index - 1];

    return previous !== undefined && week === previous + 1;
  });

  const first = weeks[0];
  const last = weeks.at(-1);

  if (consecutive && first !== undefined && last !== undefined) {
    return `Weeks ${first}–${last}`;
  }

  return `W${weeks.join(", ")}`;
}

function attentionLabel(issue: string): string {
  switch (issue) {
    case "Topic":
      return "Topic / content missing";

    case "CLO":
      return "CLO not linked";

    case "LLO":
      return "Lesson outcome missing";

    case "Teaching method":
      return "Teaching method missing";

    case "Learning activity":
      return "Learning activity missing";

    case "Learning time":
      return "Learning time missing";

    case "Assessment":
      return "Assessment missing";

    default:
      return issue;
  }
}

/* ================================================================
   Compact Table Components
   ================================================================ */

function CompactTags({
  label,
  items,
  empty,
}: {
  label?: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">{empty}</span>
      )}
    </div>
  );
}

function CompactList({
  label,
  items,
  empty,
  max,
  className,
}: {
  label: string;
  items: string[];
  empty: string;
  max: number;
  className?: string;
}) {
  const visible = items.slice(0, max);

  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      {visible.length > 0 ? (
        <ul className="space-y-1 text-xs text-foreground">
          {visible.map((item, index) => (
            <li key={`${item}-${index}`} className="line-clamp-2">
              <span className="mr-1 text-muted-foreground">•</span>

              {item}
            </li>
          ))}

          {items.length > max ? (
            <li className="text-muted-foreground">
              +{items.length - max} more
            </li>
          ) : null}
        </ul>
      ) : (
        <span className="text-xs text-muted-foreground">{empty}</span>
      )}
    </div>
  );
}

function HourRow({ label, value }: { label: string; value: string }) {
  const hours = Number(value) || 0;

  if (hours <= 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>

      <span className="font-medium text-foreground">{hours} h</span>
    </div>
  );
}

/* ================================================================
   Shared
   ================================================================ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      {children}
    </section>
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
