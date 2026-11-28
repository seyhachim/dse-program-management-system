"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Info,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { courseSpecSessionType, courseSpecPlannedWeeks, COURSE_SPEC_SESSION_TYPE_LABELS, courseSpecWeeklyPlanWeekAttention, type Method } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import type { CloForm } from "./clos-section";
import {
  MAX_INSTRUCTIONAL_WEEKS,
  cloChip,
  cloColor,
  cloCoverage,
  cloSltAllocation,
  instructionalWeeklyPlan,
  isAssessmentOnlyWeek,
  weekSltForm,
  weeklyPlanFormTotals,
  type WeeklyPlanForm,
} from "./weekly-plan-model";
import { duplicateWeeklyPlanWeek } from "./weekly-plan-duplicate";
import { teachingResourceLabel } from "./weekly-plan/week-form-fields";
import { WeekFormModal } from "./weekly-plan/week-form-modal";
import {
  CourseSpecAuthoringHeader,
  CourseSpecAuthoringStack,
  CourseSpecEmptyState,
  CourseSpecNotice,
} from "./authoring-section-ui";

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
  ready,
  clos = [],
  teachingMethods = [],
  assessmentMethods = [],
}: {
  value: WeeklyPlanForm;
  onPersist: (v: WeeklyPlanForm) => Promise<boolean>;
  courseId: string;
  courseName?: string;
  ready: boolean;
  clos?: CloForm[];
  teachingMethods?: Method[];
  assessmentMethods?: Method[];
}) {
  const plan = courseSpecPlannedWeeks(value);
  const preservedCount = Math.max(0, value.length - plan.length);
  const teachingCount = value.filter((week) => !isAssessmentOnlyWeek(week)).length;
  const atLimit = teachingCount >= MAX_INSTRUCTIONAL_WEEKS;
  const cloCodes = clos.map((clo) => clo.code);
  const teachingMethodById = new Map(
    teachingMethods.map((method) => [method.id, method]),
  );
  const assessmentMethodById = new Map(
    assessmentMethods.map((method) => [method.id, method]),
  );

  const [modal, setModal] = useState<{
    open: boolean;
    weekId: string | null;
  }>({ open: false, weekId: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedWeekIds, setExpandedWeekIds] = useState<Set<string>>(
    () => new Set(),
  );

  const displayWeekForId = (weekId: string) => value.find((item) => item.id === weekId)?.week ?? "";

  const persistPlan = async (next: WeeklyPlanForm) => {
    const count = next.filter((week) => !isAssessmentOnlyWeek(week)).length;
    if (count > MAX_INSTRUCTIONAL_WEEKS && count > teachingCount) {
      setNotice(`Technical authoring limit: ${MAX_INSTRUCTIONAL_WEEKS} instructional rows.`);
      return false;
    }
    return onPersist(next);
  };

  const openAdd = () => {
    if (new Set(value.map((week) => Number(week.week))).size >= 52) {
      setNotice("No free week number remains.");
      return;
    }
    setModal({ open: true, weekId: null });
  };
  const openEdit = (weekId: string) => setModal({ open: true, weekId });

  const toggleExpanded = (weekId: string) => {
    setExpandedWeekIds((current) => {
      const next = new Set(current);
      if (next.has(weekId)) next.delete(weekId);
      else next.add(weekId);
      return next;
    });
  };

  const duplicate = async (id: string) => {
    const source = plan.find((item) => item.id === id);
    if (!source) return;
    if (atLimit && !isAssessmentOnlyWeek(source)) {
      setNotice(`Technical authoring limit: ${MAX_INSTRUCTIONAL_WEEKS} instructional rows.`);
      return;
    }

    const sourceDisplayWeek = displayWeekForId(id);
    const next = duplicateWeeklyPlanWeek(value, id);
    const duplicated = next.at(-1);
    const duplicatedDisplayWeek = duplicated?.week ?? "";
    if (!duplicated || Number(duplicated.week) > 52) { setNotice("No valid next week number remains."); return; }
    const ok = await persistPlan(next);
    setNotice(
      ok
        ? `Week ${duplicatedDisplayWeek} was created from week ${sourceDisplayWeek}.`
        : `Could not duplicate week ${sourceDisplayWeek}.`,
    );
  };

  const remove = async (id: string) => {
    const displayWeek = displayWeekForId(id);
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete week ${displayWeek}? This can't be undone.`)
    ) return;

    const ok = await persistPlan(value.filter((item) => item.id !== id));
    if (ok) {
      setExpandedWeekIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <CourseSpecAuthoringStack>
      <CourseSpecAuthoringHeader
        title="Weekly Plan"
        description={`Plan teaching and assessment sessions${courseName ? ` for ${courseName}` : ""} according to the approved calendar. Reconcile assessment workload without counting it twice.`}
        ready={ready}
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Week
          </Button>
        }
      />

      {preservedCount > 0 ? (
        <CourseSpecNotice>
          {preservedCount} empty legacy assessment {preservedCount === 1 ? "placeholder is" : "placeholders are"} preserved for audit history. Assessment-only sessions are excluded from official teaching-week SLT.
        </CourseSpecNotice>
      ) : null}

      {notice ? (
        <CourseSpecNotice onDismiss={() => setNotice(null)}>
          {notice}
        </CourseSpecNotice>
      ) : null}

      <WeeklyPlanDashboard plan={plan} cloCodes={cloCodes} />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Weekly Plan ({plan.length} sessions · {instructionalWeeklyPlan(plan).length} instructional)
          </h3>
        </div>

        {plan.length === 0 ? (
          <EmptyWeeklyPlan onAdd={openAdd} />
        ) : (
          <div className="space-y-2.5">
            {plan.map((week) => {
              const displayWeek = week.week;
              const sessionType = courseSpecSessionType(week);
              const llos = weekLessonOutcomes(week);
              const activities = weekActivities(week);
              const teaching = week.teachingMethodIds.map(
                (methodId) => teachingMethodById.get(methodId)?.name ?? "Unknown method",
              );
              const resources = week.teachingResourceTypes.map(teachingResourceLabel);
              const assessments = week.assessmentMethodIds.length > 0
                ? week.assessmentMethodIds.map(
                    (methodId) => assessmentMethodById.get(methodId)?.name ?? "Unknown method",
                  )
                : week.assessment ? [week.assessment] : [];
              const attention = weekAttention(week);
              const expanded = expandedWeekIds.has(week.id);

              return (
                <article key={week.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`week-details-${week.id}`}
                      onClick={() => toggleExpanded(week.id)}
                      className="min-w-0 flex-1 p-3 text-left transition-colors hover:bg-muted/30 sm:p-4"
                    >
                      <div className="grid min-w-0 gap-3 sm:grid-cols-[52px_minmax(0,2fr)_minmax(120px,1fr)_76px_minmax(110px,1fr)_110px_22px] sm:items-center">
                        <div className="flex items-center gap-2 sm:block">
                          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-accent px-2 text-xs font-semibold text-accent-foreground">
                            {displayWeek}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground sm:hidden">Week</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{week.topic || "Untitled week"}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{COURSE_SPEC_SESSION_TYPE_LABELS[sessionType]}</span>
                            {week.cloCodes.length > 0 ? week.cloCodes.map((code) => (
                              <span key={code} className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cloChip(code)}`}>{code}</span>
                            )) : <span className="text-xs text-muted-foreground">No CLO linked</span>}
                            {llos.length > 0 ? (
                              <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {llos.length} {llos.length === 1 ? "LLO" : "LLOs"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <SummaryValue label="Teaching" value={summarizeItems(teaching, sessionType === "assessment" ? "Not applicable" : "No method")} />
                        <SummaryValue label="SLT" value={`${weekSltForm(week)} h`} strong />
                        <SummaryValue label="Assessment" value={summarizeItems(assessments, sessionType === "teaching" ? "None scheduled" : "Missing")} />
                        <div><WeekStatus attention={attention} /></div>
                        <ChevronDown className={`hidden h-4 w-4 text-muted-foreground transition-transform sm:block ${expanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    <div className="flex shrink-0 flex-col justify-center gap-1 border-l border-border bg-muted/15 px-1.5 sm:flex-row sm:items-center sm:border-l-0 sm:bg-transparent sm:px-3">
                      <IconButton label={`Edit week ${displayWeek}`} onClick={() => openEdit(week.id)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label={`Duplicate week ${displayWeek}`} onClick={() => void duplicate(week.id)}><Copy className="h-4 w-4" /></IconButton>
                      <IconButton label={`Delete week ${displayWeek}`} danger onClick={() => void remove(week.id)}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  </div>

                  {expanded ? (
                    <div id={`week-details-${week.id}`} className="border-t border-border bg-muted/10 p-3 sm:p-4">
                      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                        <DetailCard title="Topic & Outcomes"><DetailList label="Lesson learning outcomes" items={llos} empty="No lesson outcomes" /></DetailCard>
                        <DetailCard title="Teaching & Learning">
                          <DetailTags label="Teaching methods" items={teaching} empty="No teaching method" />
                          <DetailList label="Learning activities" items={activities} empty="No learning activities" />
                          <DetailTags label="Resources" items={resources} empty="No teaching resources selected" />
                        </DetailCard>
                        <DetailCard title="Student Learning Time">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <TimeDetail label="Lecture" value={week.lectureHours} />
                            <TimeDetail label="Tutorial" value={week.tutorialHours} />
                            <TimeDetail label="Practice" value={week.practiceHours} />
                            <TimeDetail label="Other" value={week.otherHours} />
                            <TimeDetail label="Independent (NF2F)" value={week.selfStudyHours} />
                            <div className="flex items-center justify-between gap-3 border-t border-border pt-2 font-semibold"><span>Total SLT</span><span>{weekSltForm(week)} h</span></div>
                          </div>
                        </DetailCard>
                        <DetailCard title="Assessment"><DetailTags items={assessments} empty={sessionType === "teaching" ? "No assessment scheduled" : "Assessment missing"} /></DetailCard>
                        <DetailCard title="Alignment & Validation"><WeekAlignmentSummary week={week} resources={resources} /></DetailCard>
                        <DetailCard title="Needs Attention">
                          {attention.length === 0 ? (
                            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Planning information is complete.</div>
                          ) : (
                            <ul className="space-y-2 text-sm">{attention.map((issue) => <li key={issue} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span>{attentionLabel(issue)}</span></li>)}</ul>
                          )}
                        </DetailCard>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">Edit opens the existing weekly-plan form. Saving continues through the same Course Specification persistence flow.</p>
                        <Button size="sm" onClick={() => openEdit(week.id)}><Pencil className="mr-1.5 h-4 w-4" />Edit Week {displayWeek}</Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>SLT = Contact Hours (Lecture + Tutorial + Practice + Other) + Independent Learning Hours (NF2F). Assessment-only session hours are excluded from instructional totals. Assessment SLT is entered separately in the Assessment tab.</span>
        </div>
      </div>

      <WeekFormModal
        open={modal.open}
        courseId={courseId}
        onOpenChange={(open) => setModal((current) => ({ ...current, open }))}
        weekId={modal.weekId}
        weeks={value}
        clos={clos}
        teachingMethods={teachingMethods}
        assessmentMethods={assessmentMethods}
        onSave={persistPlan}
      />
    </CourseSpecAuthoringStack>
  );
}

function EmptyWeeklyPlan({ onAdd }: { onAdd: () => void }) {
  return (
    <CourseSpecEmptyState
      icon={<CalendarDays className="h-9 w-9" />}
      title="No weeks planned yet"
      description="Add the first instructional week to start building the weekly learning plan."
      action={
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Week
        </Button>
      }
    />
  );
}

function SummaryValue({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-0.5 truncate text-xs ${strong ? "font-semibold text-foreground" : "text-foreground"}`} title={value}>{value}</p></div>;
}

function WeekStatus({ attention }: { attention: string[] }) {
  if (attention.length === 0) return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Complete</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />{attention.length} {attention.length === 1 ? "issue" : "issues"}</span>;
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-lg border border-border bg-card p-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>{children}</section>;
}

function DetailTags({ label, items, empty }: { label?: string; items: string[]; empty: string }) {
  return <div>{label ? <p className="mb-1.5 text-xs font-medium text-foreground">{label}</p> : null}{items.length > 0 ? <div className="flex flex-wrap gap-1.5">{items.map((item, index) => <span key={`${item}-${index}`} className="inline-flex rounded-md bg-muted px-2 py-1 text-xs text-foreground">{item}</span>)}</div> : <span className="text-xs text-muted-foreground">{empty}</span>}</div>;
}

function DetailList({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return <div><p className="mb-1.5 text-xs font-medium text-foreground">{label}</p>{items.length > 0 ? <ul className="space-y-1.5 text-xs text-foreground">{items.map((item, index) => <li key={`${item}-${index}`} className="flex items-start gap-2"><span className="text-muted-foreground">•</span><span>{item}</span></li>)}</ul> : <span className="text-xs text-muted-foreground">{empty}</span>}</div>;
}

function TimeDetail({ label, value }: { label: string; value: string }) {
  const hours = Number(value) || 0;
  return <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium text-foreground">{hours} h</span></div>;
}

function WeeklyPlanDashboard({ plan, cloCodes }: { plan: WeeklyPlanForm; cloCodes: string[] }) {
  const instructional = instructionalWeeklyPlan(plan);
  const totals = weeklyPlanFormTotals(instructional);
  const coverage = cloCoverage(instructional, cloCodes.length ? cloCodes : undefined);
  const coveredClos = coverage.filter((item) => item.weeks > 0).length;
  const attentionWeeks = plan.filter((week) => weekAttention(week).length > 0);
  const completeWeeks = Math.max(0, plan.length - attentionWeeks.length);
  return <div className="space-y-3"><div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
    <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="Total Sessions" value={plan.length} detail={`${instructional.length} instructional weeks`} />
    <MetricCard icon={<Clock className="h-4 w-4" />} label="Instructional SLT" value={`${totals.slt} h`} detail={`${totals.selfStudyHours} h independent`} />
    <MetricCard icon={<Target className="h-4 w-4" />} label="CLOs Covered" value={coverage.length > 0 ? `${coveredClos} / ${coverage.length}` : "—"} detail={coverage.length > 0 ? `${Math.round((coveredClos / coverage.length) * 100)}% coverage` : "No CLOs available"} />
    <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Need Attention" value={attentionWeeks.length} detail={attentionWeeks.length === 1 ? "Week" : "Weeks"} tone="attention" />
    <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Complete" value={completeWeeks} detail={completeWeeks === 1 ? "Week" : "Weeks"} tone="complete" />
  </div><div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(260px,0.75fr)]"><CloCoverageOverview plan={instructional} cloCodes={cloCodes} /><AttentionSummary plan={plan} /></div></div>;
}

function MetricCard({ icon, label, value, detail, tone = "default" }: { icon: React.ReactNode; label: string; value: string | number; detail: string; tone?: "default" | "attention" | "complete" }) {
  const toneClasses = tone === "attention" ? "border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20" : tone === "complete" ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20" : "border-border bg-card";
  return <div className={`min-w-0 rounded-xl border p-3 shadow-sm ${toneClasses}`}><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">{icon}</span><div className="min-w-0"><p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p><p className="mt-0.5 text-xl font-bold leading-none tracking-tight text-foreground">{value}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</p></div></div></div>;
}

function CloCoverageOverview({ plan, cloCodes }: { plan: WeeklyPlanForm; cloCodes: string[] }) {
  const coverage = cloCoverage(plan, cloCodes.length ? cloCodes : undefined);
  const allocations = cloSltAllocation(plan, cloCodes.length ? cloCodes : undefined);
  const allocationByCode = new Map(allocations.map((item) => [item.code, item.sltHours]));
  const maxAllocation = Math.max(1, ...allocations.map((item) => item.sltHours));
  const totalSlt = weeklyPlanFormTotals(plan).slt;
  return <Card><div className="mb-3"><h3 className="text-sm font-semibold text-foreground">CLO Coverage</h3><p className="mt-1 text-[11px] text-muted-foreground">Planned learning time and weekly coverage for each CLO.</p></div>{coverage.length === 0 ? <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center"><p className="text-sm text-muted-foreground">Link CLOs to weeks to see coverage.</p></div> : <><div className="hidden grid-cols-[52px_minmax(0,1fr)_105px_60px] items-center gap-2 border-b border-border pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span>CLO</span><span>Coverage</span><span>Weeks</span><span className="text-right">SLT</span></div><div>{coverage.map((item) => { const hours = allocationByCode.get(item.code) ?? 0; const width = Math.min(100, (hours / maxAllocation) * 100); const weeks = plan.flatMap((week) => week.cloCodes.includes(item.code) ? [Number(week.week)] : []); return <div key={item.code} className="grid gap-2 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[52px_minmax(0,1fr)_105px_60px] sm:items-center"><span className={`inline-flex w-fit rounded-md px-1.5 py-0.5 text-xs font-semibold ${cloChip(item.code)}`}>{item.code}</span><div className="min-w-0"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: cloColor(item.code) }} /></div><p className="mt-1 text-[10px] text-muted-foreground">{item.weeks > 0 ? `${item.weeks} ${item.weeks === 1 ? "week" : "weeks"} linked` : "Not linked"}</p></div><span className="text-[11px] text-muted-foreground">{formatWeekRange(weeks)}</span><span className="text-xs font-semibold text-foreground sm:text-right">{hours.toFixed(1)} h</span></div>; })}</div><div className="mt-2 flex items-center justify-between border-t border-border pt-3"><span className="text-xs font-semibold text-foreground">Total Student Learning Time</span><span className="text-sm font-bold text-foreground">{totalSlt.toFixed(1)} h</span></div></>}</Card>;
}

function AttentionSummary({ plan }: { plan: WeeklyPlanForm }) {
  const grouped = new Map<string, number>();
  for (const week of plan) for (const issue of weekAttention(week)) grouped.set(issue, (grouped.get(issue) ?? 0) + 1);
  const issues = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  const attentionWeeks = plan.filter((week) => weekAttention(week).length > 0).length;
  return <Card><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-foreground">Needs Attention</h3><p className="mt-1 text-[11px] text-muted-foreground">Missing planning information.</p></div>{attentionWeeks > 0 ? <span className="inline-flex shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{attentionWeeks} {attentionWeeks === 1 ? "week" : "weeks"}</span> : null}</div>{issues.length === 0 ? <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">All planned weeks are complete.</span></div></div> : <div className="overflow-hidden rounded-lg border border-border">{issues.slice(0, 5).map(([issue, count]) => <div key={issue} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 last:border-b-0"><div className="flex min-w-0 items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /></span><span className="truncate text-xs font-medium text-foreground">{attentionLabel(issue)}</span></div><span className="shrink-0 text-[11px] font-medium text-muted-foreground">{count} {count === 1 ? "week" : "weeks"}</span></div>)}</div>}<div className="mt-3 rounded-lg border border-blue-200/70 bg-blue-50/50 p-2.5 dark:border-blue-900/40 dark:bg-blue-950/20"><div className="flex items-start gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" /><p className="text-[10px] leading-4 text-muted-foreground">Attention means planning information is incomplete. It does not indicate poor teaching quality or non-compliance.</p></div></div></Card>;
}

function weekLessonOutcomes(week: WeeklyPlanForm[number]): string[] { return week.lessonLearningOutcomes.length > 0 ? week.lessonLearningOutcomes.map((llo) => llo.description).filter(Boolean) : week.lloItems.filter(Boolean); }
function weekActivities(week: WeeklyPlanForm[number]): string[] { return week.studentLearningActivities.length > 0 ? week.studentLearningActivities.map((activity) => activity.title).filter(Boolean) : week.activities.filter(Boolean); }
function weekAttention(week: WeeklyPlanForm[number]): string[] { return courseSpecWeeklyPlanWeekAttention(week); }
function summarizeItems(items: string[], empty: string): string { if (items.length === 0) return empty; if (items.length === 1) return items[0] ?? empty; return `${items[0]} +${items.length - 1}`; }
function formatWeekRange(weeks: number[]): string { if (weeks.length === 0) return "—"; if (weeks.length === 1) return `Week ${weeks[0]}`; const consecutive = weeks.every((week, index) => index === 0 || week === weeks[index - 1]! + 1); const first = weeks[0]; const last = weeks.at(-1); if (consecutive && first !== undefined && last !== undefined) return `Weeks ${first}–${last}`; return `W${weeks.join(", ")}`; }
function attentionLabel(issue: string): string { switch (issue) { case "Topic": return "Topic / content missing"; case "CLO": return "CLO not linked"; case "LLO": return "Lesson outcome missing"; case "Teaching method": return "Teaching method missing"; case "Learning activity": return "Learning activity missing"; case "Learning time": return "Learning time missing"; case "Assessment": return "Assessment missing"; default: return issue; } }

function WeekAlignmentSummary({ week, resources }: { week: WeeklyPlanForm[number]; resources: string[] }) {
  const type = courseSpecSessionType(week);
  const issues = courseSpecWeeklyPlanWeekAttention(week);
  const coreEvidence = [
    { label: "CLO", issue: "CLO" },
    ...(type === "assessment" ? [] : [{ label: "LLO", issue: "LLO" }, { label: "Teaching", issue: "Teaching method" }, { label: "Activity", issue: "Learning activity" }]),
    ...(type === "teaching" ? [] : [{ label: "Assessment", issue: "Assessment" }]),
  ].map((item) => ({ label: item.label, ready: !issues.some((issue) => issue === item.issue) }));
  const missing = coreEvidence.filter((item) => !item.ready).map((item) => item.label);
  return <div className="space-y-2"><div className="flex flex-wrap items-center gap-1">{coreEvidence.map((item) => <span key={item.label} className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${item.ready ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"}`}>{item.ready ? "✓" : "○"} {item.label}</span>)}</div>{missing.length === 0 ? <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Required alignment evidence is present for this session.</p> : <p className="text-[11px] text-amber-700 dark:text-amber-300">Evidence not yet established for: {missing.join(", ")}.</p>}{type === "teaching" && !week.assessment.trim() && week.assessmentMethodIds.length === 0 ? <p className="text-[11px] text-muted-foreground">No assessment scheduled. CLO assessment coverage is checked across the course.</p> : null}{resources.length > 0 ? <p className="text-[10px] text-muted-foreground">Supporting resources: {resources.join(", ")}</p> : null}</div>;
}

function Card({ children }: { children: React.ReactNode }) { return <section className="rounded-xl border border-border bg-card p-4 shadow-sm">{children}</section>; }
function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-label={label} title={label} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted ${danger ? "text-status-live hover:border-status-live/40" : "text-muted-foreground hover:text-foreground"}`}>{children}</button>; }
