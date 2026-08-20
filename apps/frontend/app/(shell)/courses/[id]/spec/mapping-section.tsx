"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Grid3X3,
  Target,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dse-pms/ui";
import { ALIGNMENT_STRENGTHS, alignmentBand } from "@dse-pms/shared-types";
import type { CloForm } from "./clo-model";
import type { WeekForm } from "./weekly-plan-model";
import type { AssessmentForm } from "./assessment-model";
import {
  buildColumns,
  cellStrength,
  columnAverage,
  downloadTextFile,
  mappingCsv,
  reconcileCells,
  setCell,
  validRefs,
  type MappingColumn,
  type MappingForm,
} from "./mapping-model";
import {
  ALIGNMENT_STATUS_LABELS,
  deriveConstructiveAlignmentAudit,
  sortedAlignmentIssues,
  type CloAlignmentAudit,
  type ConstructiveAlignmentStatus,
} from "./constructive-alignment-model";

type ViewBy = "clo" | "component";

const STATUS_STYLE: Record<ConstructiveAlignmentStatus, string> = {
  fullyAligned:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  teachingOnly:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
  assessmentOnly:
    "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300",
  notAligned:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300",
};

const STATUS_COPY: Record<ConstructiveAlignmentStatus, string> = {
  fullyAligned: "This CLO has both teaching and assessment coverage.",
  teachingOnly:
    "Students are taught this CLO, but there is no active assessment that measures it.",
  assessmentOnly:
    "This CLO is assessed, but no Weekly Plan item currently provides teaching coverage.",
  notAligned:
    "This CLO has no teaching or active assessment evidence in the current Course Specification.",
};

function goToTab(tab: "slt" | "assessmentPlan") {
  if (typeof window === "undefined") return;
  window.location.assign(`${window.location.pathname}?tab=${tab}`);
}

export function MappingSection({
  clos,
  weeklyPlan,
  assessments,
  value,
  onChange,
  courseName,
}: {
  clos: CloForm[];
  weeklyPlan: WeekForm[];
  assessments: AssessmentForm[];
  value: MappingForm;
  onChange: (cells: MappingForm) => void;
  courseName?: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewBy, setViewBy] = useState<ViewBy>("clo");
  const [reportOpen, setReportOpen] = useState(false);
  const [heatmapOpen, setHeatmapOpen] = useState(false);

  const audit = useMemo(
    () => deriveConstructiveAlignmentAudit(clos, weeklyPlan, assessments),
    [clos, weeklyPlan, assessments],
  );
  const issues = useMemo(() => sortedAlignmentIssues(audit.clos), [audit.clos]);
  const cells = useMemo(
    () => reconcileCells(value, validRefs(clos, weeklyPlan, assessments)),
    [value, clos, weeklyPlan, assessments],
  );
  const { weekColumns, assessmentColumns } = useMemo(
    () => buildColumns(weeklyPlan, assessments),
    [weeklyPlan, assessments],
  );
  const advancedColumns = useMemo(
    () => [...weekColumns, ...assessmentColumns],
    [weekColumns, assessmentColumns],
  );

  const exportCsv = () => {
    const csv = mappingCsv(cells, clos, weekColumns, assessmentColumns);
    const base = (courseName ?? "course").replace(/[^\w.-]+/g, "_");
    downloadTextFile(`${base}_clo-mapping.csv`, csv);
  };

  if (audit.activeCloCount === 0) {
    return (
      <EmptyState
        title="No active CLOs available"
        body="Constructive Alignment depends on active Course Learning Outcomes. Add or activate at least one CLO before reviewing alignment."
        actionLabel="Go to CLOs"
        onAction={() => {
          if (typeof window !== "undefined") {
            window.location.assign(`${window.location.pathname}?tab=clos`);
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Constructive Alignment</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Verify that every active CLO is taught and assessed. Fix coverage gaps in the source sections before submission.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setAdvancedOpen((open) => !open)}>
            <Grid3X3 className="h-4 w-4" />
            {advancedOpen ? "Hide Advanced Matrix" : "View Advanced Matrix"}
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export Alignment
          </Button>
        </div>
      </header>

      <AlignmentSummary audit={audit} />
      <SourceAvailability audit={audit} />

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Alignment by CLO</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Teaching coverage comes from Weekly Plan CLO links. Assessment coverage counts active assessments only.
          </p>
        </div>
        <div className="space-y-3">
          {audit.clos.map((row) => (
            <CloAlignmentCard key={row.code} row={row} />
          ))}
        </div>
      </section>

      <AlignmentIssues issues={issues} />

      <div className="grid gap-4 xl:grid-cols-2">
        <TeachingCoverage rows={audit.clos} />
        <AssessmentCoverage rows={audit.clos} />
      </div>

      <AdvisoryWarnings audit={audit} />

      {advancedOpen ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Advanced Alignment Matrix</h3>
              <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                Optionally rate relationship strength for deeper curriculum analysis and QA evidence. Source links are not assigned a strength automatically; an unrated relationship stays unrated until you explicitly choose 0–3.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setReportOpen(true)}>
                <FileText className="h-4 w-4" /> Report
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setHeatmapOpen(true)}>
                <Target className="h-4 w-4" /> Heatmap
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">View by</span>
            <Select value={viewBy} onValueChange={(value) => setViewBy(value as ViewBy)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clo">CLO</SelectItem>
                <SelectItem value="component">Component</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <StrengthLegend />
          <div className="mt-4 overflow-x-auto">
            <AdvancedMatrix
              viewBy={viewBy}
              clos={clos.filter((clo) => clo.status === "active")}
              columns={advancedColumns}
              cells={cells}
              onSet={(column, cloCode, strength) =>
                onChange(setCell(cells, column.kind, column.ref, cloCode, strength))
              }
            />
          </div>
        </section>
      ) : null}

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        rows={audit.clos}
        columns={advancedColumns}
        cells={cells}
      />
      <HeatmapDialog
        open={heatmapOpen}
        onOpenChange={setHeatmapOpen}
        rows={audit.clos}
        columns={advancedColumns}
        cells={cells}
      />
    </div>
  );
}

function AlignmentSummary({ audit }: { audit: ReturnType<typeof deriveConstructiveAlignmentAudit> }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {audit.allAligned ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            <h3 className="font-semibold text-foreground">
              {audit.allAligned ? "All aligned" : "Needs attention"}
            </h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {audit.allAligned
              ? "Every active CLO has teaching and active assessment coverage."
              : `${audit.issueCount} ${audit.issueCount === 1 ? "CLO needs" : "CLOs need"} alignment attention.`}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Active CLOs" value={audit.activeCloCount} />
        <SummaryCard label="Taught" value={`${audit.taughtCount} / ${audit.activeCloCount}`} />
        <SummaryCard label="Assessed" value={`${audit.assessedCount} / ${audit.activeCloCount}`} />
        <SummaryCard label="Alignment Issues" value={audit.issueCount} attention={audit.issueCount > 0} />
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string | number;
  attention?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-4">
      <div className={`text-2xl font-bold ${attention ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function SourceAvailability({ audit }: { audit: ReturnType<typeof deriveConstructiveAlignmentAudit> }) {
  if (audit.hasWeeklyPlan && audit.hasAssessments) return null;

  if (!audit.hasWeeklyPlan && !audit.hasAssessments) {
    return (
      <Notice
        title="Alignment cannot be fully evaluated yet"
        body="Add teaching coverage in Weekly Plan and assessment coverage in Assessment."
        actions={[
          { label: "Go to Weekly Plan", onClick: () => goToTab("slt") },
          { label: "Go to Assessment", onClick: () => goToTab("assessmentPlan") },
        ]}
      />
    );
  }

  if (!audit.hasWeeklyPlan) {
    return (
      <Notice
        title="Teaching coverage is not available yet"
        body="Your CLOs are defined, but no Weekly Plan has been created."
        actions={[{ label: "Build Weekly Plan", onClick: () => goToTab("slt") }]}
      />
    );
  }

  return (
    <Notice
      title="Assessment coverage is not available yet"
      body="Your CLOs may have teaching coverage, but no assessments have been created."
      actions={[{ label: "Create Assessment", onClick: () => goToTab("assessmentPlan") }]}
    />
  );
}

function CloAlignmentCard({ row }: { row: CloAlignmentAudit }) {
  const statusLabel = ALIGNMENT_STATUS_LABELS[row.status];
  return (
    <article className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{row.code}</span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[row.status]}`}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground/90">{row.description || "No CLO description"}</p>
          <p className="mt-2 text-xs text-muted-foreground">{STATUS_COPY[row.status]}</p>
        </div>
        <CloActions row={row} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <CoverageBlock
          icon={BookOpen}
          title="Teaching coverage"
          empty="No Weekly Plan item teaches this CLO."
          items={row.teachingWeeks.map((week) =>
            `W${week.week || "?"} — ${week.topic || "Untitled topic"}`,
          )}
        />
        <CoverageBlock
          icon={ClipboardCheck}
          title="Assessment coverage"
          empty="No active assessment measures this CLO."
          items={row.activeAssessments.map((assessment) =>
            `${assessment.name || "Untitled assessment"}${assessment.weight ? ` · ${assessment.weight}%` : ""}`,
          )}
        />
      </div>

      {row.inactiveAssessments.length > 0 ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Inactive mapping:</span>{" "}
          {row.inactiveAssessments.map((item) => item.name || "Untitled assessment").join(", ")}. Inactive assessments do not count toward alignment coverage.
        </div>
      ) : null}
    </article>
  );
}

function CloActions({ row }: { row: CloAlignmentAudit }) {
  if (row.status === "fullyAligned") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => goToTab("slt")}>View Weekly Plan</Button>
        <Button variant="outline" size="sm" onClick={() => goToTab("assessmentPlan")}>View Assessment</Button>
      </div>
    );
  }
  if (row.status === "teachingOnly") {
    return <Button size="sm" onClick={() => goToTab("assessmentPlan")}>Add assessment coverage</Button>;
  }
  if (row.status === "assessmentOnly") {
    return <Button size="sm" onClick={() => goToTab("slt")}>Add teaching coverage</Button>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => goToTab("slt")}>Add teaching coverage</Button>
      <Button variant="outline" size="sm" onClick={() => goToTab("assessmentPlan")}>Add assessment coverage</Button>
    </div>
  );
}

function CoverageBlock({
  icon: Icon,
  title,
  items,
  empty,
}: {
  icon: typeof BookOpen;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">— {empty}</p>
      )}
    </div>
  );
}

function AlignmentIssues({ issues }: { issues: CloAlignmentAudit[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Alignment Issues</h3>
      {issues.length === 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Every active CLO is both taught and assessed.</span>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {issues.map((row) => (
            <div key={row.code} className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {row.code} — {ALIGNMENT_STATUS_LABELS[row.status]}
                  </div>
                  <div className="text-xs text-muted-foreground">{STATUS_COPY[row.status]}</div>
                </div>
              </div>
              <CloActions row={row} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TeachingCoverage({ rows }: { rows: CloAlignmentAudit[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Teaching Coverage</h3>
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => goToTab("slt")}>
          Weekly Plan <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.code} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="text-xs font-semibold text-foreground">{row.code}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.teachingWeeks.length > 0
                ? row.teachingWeeks.map((week) => `W${week.week || "?"} ${week.topic || "Untitled"}`).join(" · ")
                : "No teaching coverage"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AssessmentCoverage({ rows }: { rows: CloAlignmentAudit[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Assessment Coverage</h3>
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => goToTab("assessmentPlan")}>
          Assessment <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.code} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="text-xs font-semibold text-foreground">{row.code}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.activeAssessments.length > 0
                ? row.activeAssessments.map((item) => item.name || "Untitled assessment").join(" · ")
                : "No active assessment coverage"}
            </div>
            {row.inactiveAssessments.length > 0 ? (
              <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                Inactive: {row.inactiveAssessments.map((item) => item.name || "Untitled assessment").join(", ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AdvisoryWarnings({ audit }: { audit: ReturnType<typeof deriveConstructiveAlignmentAudit> }) {
  const lowTeaching = audit.clos.filter((row) => row.teachingWeeks.length === 1);
  if (
    audit.unmappedWeeks.length === 0 &&
    audit.unmappedActiveAssessments.length === 0 &&
    lowTeaching.length === 0
  ) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Advisory Quality Warnings</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        These items do not change the core taught-and-assessed status, but they are worth reviewing.
      </p>
      <div className="mt-3 space-y-2 text-sm">
        {audit.unmappedWeeks.map((week) => (
          <Warning key={`week-${week.id}`}>
            Week {week.week || "?"} ({week.topic || "Untitled topic"}) has no CLO linked.
          </Warning>
        ))}
        {audit.unmappedActiveAssessments.map((item) => (
          <Warning key={`assessment-${item.id}`}>
            {item.name || "Untitled assessment"} does not currently measure any CLO.
          </Warning>
        ))}
        {lowTeaching.map((row) => (
          <Warning key={`low-${row.code}`}>
            {row.code} appears in only one teaching week. Review whether the coverage is sufficient.
          </Warning>
        ))}
      </div>
    </section>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function StrengthLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Strength:</span>
      <span>— Unrated</span>
      {ALIGNMENT_STRENGTHS.map((strength) => (
        <span key={strength.code} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: strength.color }} />
          {strength.name} ({strength.value})
        </span>
      ))}
    </div>
  );
}

function AdvancedMatrix({
  viewBy,
  clos,
  columns,
  cells,
  onSet,
}: {
  viewBy: ViewBy;
  clos: CloForm[];
  columns: MappingColumn[];
  cells: MappingForm;
  onSet: (column: MappingColumn, cloCode: string, strength: number | null) => void;
}) {
  if (columns.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No Weekly Plan or Assessment components are available for the advanced matrix.</p>;
  }

  if (viewBy === "component") {
    return (
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-52 border-b border-border bg-card px-3 py-2 text-left font-semibold text-foreground">Component</th>
            {clos.map((clo) => (
              <th key={clo.code} className="min-w-28 border-b border-border px-3 py-2 text-center font-semibold text-foreground">{clo.code}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={`${column.kind}-${column.ref}`}>
              <td className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2">
                <div className="font-medium text-foreground">{column.label}</div>
                <div className="max-w-48 truncate text-[11px] text-muted-foreground" title={column.title}>{column.title}</div>
              </td>
              {clos.map((clo) => (
                <td key={clo.code} className="border-b border-border px-2 py-2 text-center">
                  <StrengthSelect
                    value={cellStrength(cells, column.kind, column.ref, clo.code)}
                    onChange={(strength) => onSet(column, clo.code, strength)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table className="min-w-full border-separate border-spacing-0 text-xs">
      <thead>
        <tr>
          <th className="sticky left-0 z-10 min-w-48 border-b border-border bg-card px-3 py-2 text-left font-semibold text-foreground">CLO</th>
          {columns.map((column) => (
            <th key={`${column.kind}-${column.ref}`} className="min-w-28 border-b border-border px-2 py-2 text-center font-semibold text-foreground" title={column.title}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {clos.map((clo) => (
          <tr key={clo.code}>
            <td className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2">
              <div className="font-medium text-foreground">{clo.code}</div>
              <div className="max-w-44 truncate text-[11px] text-muted-foreground" title={clo.description}>{clo.description}</div>
            </td>
            {columns.map((column) => (
              <td key={`${column.kind}-${column.ref}`} className="border-b border-border px-2 py-2 text-center">
                <StrengthSelect
                  value={cellStrength(cells, column.kind, column.ref, clo.code)}
                  onChange={(strength) => onSet(column, clo.code, strength)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StrengthSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const band = alignmentBand(value);
  return (
    <Select
      value={value == null ? "unrated" : String(value)}
      onValueChange={(next) => onChange(next === "unrated" ? null : Number(next))}
    >
      <SelectTrigger className="mx-auto h-8 w-[86px] text-xs">
        <SelectValue>
          {() => (band ? `${band.value} ${band.name}` : "— Unrated")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unrated">— Unrated</SelectItem>
        {[0, 1, 2, 3].map((strength) => (
          <SelectItem key={strength} value={String(strength)}>
            {strength} {alignmentBand(strength)?.name ?? ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  rows,
  columns,
  cells,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CloAlignmentAudit[];
  columns: MappingColumn[];
  cells: MappingForm;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Constructive Alignment Report</DialogTitle>
          <DialogDescription>Coverage status and optional explicit strength ratings.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.code} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{row.code}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.status]}`}>
                  {ALIGNMENT_STATUS_LABELS[row.status]}
                </span>
              </div>
            ))}
          </div>
          {columns.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold text-foreground">Explicit strength averages</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {columns.map((column) => {
                  const average = columnAverage(cells, column.kind, column.ref);
                  return (
                    <div key={`${column.kind}-${column.ref}`} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="font-medium text-foreground">{column.label}</div>
                      <div className="text-muted-foreground">{average == null ? "Not rated" : `Average ${average.toFixed(1)} / 3`}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeatmapDialog({
  open,
  onOpenChange,
  rows,
  columns,
  cells,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CloAlignmentAudit[];
  columns: MappingColumn[];
  cells: MappingForm;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Alignment Strength Heatmap</DialogTitle>
          <DialogDescription>Only explicit lecturer ratings are coloured. Unrated relationships remain blank.</DialogDescription>
        </DialogHeader>
        {columns.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No components available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left">CLO</th>
                  {columns.map((column) => (
                    <th key={`${column.kind}-${column.ref}`} className="min-w-24 px-2 py-2 text-center">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code}>
                    <td className="px-2 py-2 font-medium">{row.code}</td>
                    {columns.map((column) => {
                      const strength = cellStrength(cells, column.kind, column.ref, row.code);
                      const band = alignmentBand(strength);
                      return (
                        <td key={`${column.kind}-${column.ref}`} className="px-2 py-2 text-center">
                          <span
                            className="inline-flex h-8 w-12 items-center justify-center rounded-md border border-border font-semibold"
                            style={band ? { backgroundColor: `${band.color}22`, color: band.color } : undefined}
                          >
                            {strength == null ? "—" : strength}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Notice({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions: Array<{ label: string; onClick: () => void }>;
}) {
  return (
    <section className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-950 dark:text-amber-100">{title}</h3>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">{body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button key={action.label} variant="outline" size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <Target className="mx-auto h-9 w-9 text-muted-foreground" />
      <h2 className="mt-3 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{body}</p>
      {actionLabel && onAction ? (
        <Button className="mt-4" onClick={onAction}>{actionLabel}</Button>
      ) : null}
    </section>
  );
}
