"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  Filter as FilterIcon,
  Grid3x3,
  ListChecks,
  Pencil,
  Target,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  mappingMetrics,
  reconcileCells,
  seedFromLinks,
  setCell,
  validRefs,
  type MappingColumn,
  type MappingForm,
} from "./mapping-model";

type ViewBy = "clo" | "component";
type AlignmentFilter = "all" | "3" | "2" | "1" | "0";

/** Convert a #rrggbb colour to an rgba() string at the given alpha. */
function tint(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  const [viewBy, setViewBy] = useState<ViewBy>("clo");
  const [alignmentFilter, setAlignmentFilter] = useState<AlignmentFilter>("all");
  const [showWeeks, setShowWeeks] = useState(true);
  const [showAssessments, setShowAssessments] = useState(true);
  const [onlyMapped, setOnlyMapped] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);

  // Drop cells whose CLO / week / assessment was removed elsewhere in the wizard.
  const cells = useMemo(
    () => reconcileCells(value, validRefs(clos, weeklyPlan, assessments)),
    [value, clos, weeklyPlan, assessments],
  );

  const { weekColumns, assessmentColumns } = useMemo(
    () => buildColumns(weeklyPlan, assessments),
    [weeklyPlan, assessments],
  );
  const cloCodes = useMemo(() => clos.map((c) => c.code), [clos]);
  const metrics = useMemo(
    () => mappingMetrics(cells, cloCodes, weekColumns, assessmentColumns),
    [cells, cloCodes, weekColumns, assessmentColumns],
  );

  const activeColumns = useMemo(() => {
    const cols: MappingColumn[] = [];
    if (showWeeks) cols.push(...weekColumns);
    if (showAssessments) cols.push(...assessmentColumns);
    return cols;
  }, [showWeeks, showAssessments, weekColumns, assessmentColumns]);

  const visibleClos = useMemo(
    () =>
      onlyMapped
        ? clos.filter((c) => cells.some((cell) => cell.cloCode === c.code && cell.strength >= 1))
        : clos,
    [clos, cells, onlyMapped],
  );

  const setStrength = (col: MappingColumn, cloCode: string, strength: number | null) => {
    onChange(setCell(cells, col.kind, col.ref, cloCode, strength));
  };

  // Seed a Medium rating for any newly linked CLO (§17/§18) that has no rating yet —
  // replaces the old manual "Auto-fill from links" button with the same behavior by default.
  useEffect(() => {
    const seeded = seedFromLinks(cells, [...weekColumns, ...assessmentColumns]);
    if (seeded.length !== cells.length) onChange(seeded);
  }, [cells, weekColumns, assessmentColumns, onChange]);

  const exportCsv = () => {
    const csv = mappingCsv(cells, clos, weekColumns, assessmentColumns);
    const base = (courseName ?? "course").replace(/[^\w.-]+/g, "_");
    downloadTextFile(`${base}_clo-mapping.csv`, csv);
  };

  const scrollToMatrix = () => matrixRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (clos.length === 0) {
    return (
      <EmptyState
        title="No CLOs to map yet"
        body="Add Course Learning Outcomes in the CLOs tab first — the mapping matrix cross-references them against the Weekly Plan and Assessments."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Mapping</h2>
          <p className="text-sm text-muted-foreground">
            Map CLOs with teaching and assessment components to ensure alignment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={viewBy} onValueChange={(v) => setViewBy(v as ViewBy)}>
            <SelectTrigger className="w-[150px]">
              <span className="text-muted-foreground">View by:&nbsp;</span>
              <SelectValue>{(v) => (v === "component" ? "Component" : "CLO")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clo">CLO</SelectItem>
              <SelectItem value="component">Component</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="gap-2">
                  <FilterIcon className="h-4 w-4" /> Filter
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showWeeks} onCheckedChange={setShowWeeks}>
                Weekly Plan
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showAssessments} onCheckedChange={setShowAssessments}>
                Assessments
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Rows</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={onlyMapped} onCheckedChange={setOnlyMapped}>
                Only mapped CLOs
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex">
            <Button className="gap-2 rounded-r-none" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export Mapping
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="Export options">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportCsv}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>Print / Save as PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-4">
          <OverviewCards metrics={metrics} />

          <section ref={matrixRef} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">CLO Mapping Matrix</h3>
              <div className="flex items-center gap-2">
                <Select
                  value={alignmentFilter}
                  onValueChange={(v) => setAlignmentFilter(v as AlignmentFilter)}
                >
                  <SelectTrigger className="w-[170px]">
                    <span className="text-muted-foreground">Alignment Type:&nbsp;</span>
                    <SelectValue>
                      {(v) =>
                        v === "all"
                          ? "All"
                          : ALIGNMENT_STRENGTHS.find((s) => String(s.value) === v)?.name ?? "All"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {ALIGNMENT_STRENGTHS.map((s) => (
                      <SelectItem key={s.code} value={String(s.value)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <StrengthLegend metrics={metrics} />

            <div className="mt-4 overflow-x-auto">
              <MatrixTable
                viewBy={viewBy}
                clos={visibleClos}
                columns={activeColumns}
                weekCount={showWeeks ? weekColumns.length : 0}
                assessmentCount={showAssessments ? assessmentColumns.length : 0}
                cells={cells}
                alignmentFilter={alignmentFilter}
                onSet={setStrength}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Click on any cell to view or edit mapping details.
            </p>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <MappingSummary metrics={metrics} />
          <AlignmentByClo metrics={metrics} onViewReport={() => setReportOpen(true)} />
          <QuickActions
            onEdit={scrollToMatrix}
            onReport={() => setReportOpen(true)}
            onHeatmap={() => setHeatmapOpen(true)}
          />
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        metrics={metrics}
        weekColumns={weekColumns}
        assessmentColumns={assessmentColumns}
        cells={cells}
        courseName={courseName}
      />
      <HeatmapDialog
        open={heatmapOpen}
        onOpenChange={setHeatmapOpen}
        clos={clos}
        columns={[...weekColumns, ...assessmentColumns]}
        cells={cells}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

function OverviewCards({ metrics }: { metrics: ReturnType<typeof mappingMetrics> }) {
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Mapping Overview</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OverviewCard
          icon={ClipboardList}
          tint="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"
          value={metrics.cloCount}
          label="CLOs"
        />
        <OverviewCard
          icon={ListChecks}
          tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
          value={metrics.weeksTotal}
          label="Weekly Topics"
          sub={`Mapped: ${metrics.weeksMapped} (${pct(metrics.weeksMapped, metrics.weeksTotal)}%)`}
        />
        <OverviewCard
          icon={Target}
          tint="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"
          value={metrics.assessmentsTotal}
          label="Assessments"
          sub={`Mapped: ${metrics.assessmentsMapped} (${pct(metrics.assessmentsMapped, metrics.assessmentsTotal)}%)`}
        />
        <OverviewCard
          icon={BarChart3}
          tint="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300"
          value={`${metrics.overallPercent}%`}
          label="Overall Alignment"
          sub="(Average Strength)"
        />
      </div>
    </section>
  );
}

function OverviewCard({
  icon: Icon,
  tint,
  value,
  label,
  sub,
}: {
  icon: typeof Target;
  tint: string;
  value: number | string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <span className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${tint}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs font-medium text-foreground">{label}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- legend */

function StrengthLegend({ metrics }: { metrics: ReturnType<typeof mappingMetrics> }) {
  const countFor = (v: number) => metrics.distribution.find((d) => d.value === v)?.count ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span className="font-medium text-foreground">Alignment Strength:</span>
      {ALIGNMENT_STRENGTHS.map((s) => (
        <span key={s.code} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
          {s.name} ({s.value})
          <span className="text-foreground/60">· {countFor(s.value)}</span>
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- matrix */

/** A single editable cell showing the current strength as a tinted dot + value. */
function MatrixCell({
  strength,
  dimmed,
  onSet,
  label,
}: {
  strength: number | null;
  dimmed: boolean;
  onSet: (strength: number | null) => void;
  label: string;
}) {
  const band = alignmentBand(strength);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={`mx-auto flex h-8 w-11 items-center justify-center rounded-md text-xs font-semibold transition hover:ring-2 hover:ring-primary/30 ${
              dimmed ? "opacity-20" : ""
            }`}
            style={band ? { backgroundColor: tint(band.color, 0.14), color: band.color } : undefined}
          >
            {band ? (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: band.color }} />
                {band.value}
              </span>
            ) : (
              <span className="text-muted-foreground/50">–</span>
            )}
          </button>
        }
      />
      <DropdownMenuContent align="center" className="w-44">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {ALIGNMENT_STRENGTHS.map((s) => (
          <DropdownMenuItem key={s.code} onClick={() => onSet(s.value)}>
            <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name} ({s.value})
            {strength === s.value ? <span className="ml-auto text-primary">✓</span> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onSet(null)} disabled={strength == null}>
          Clear rating
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AvgCell({ value }: { value: number | null }) {
  const band = alignmentBand(value);
  return (
    <td className="px-1 py-2 text-center">
      <span
        className="inline-block min-w-9 rounded-md px-1.5 py-1 text-xs font-semibold"
        style={
          band ? { backgroundColor: tint(band.color, 0.12), color: band.color } : { color: "var(--muted-foreground)" }
        }
      >
        {value == null ? "–" : value.toFixed(1)}
      </span>
    </td>
  );
}

function matchesFilter(strength: number | null, filter: AlignmentFilter): boolean {
  if (filter === "all") return true;
  return strength != null && strength === Number(filter);
}

function MatrixTable({
  viewBy,
  clos,
  columns,
  weekCount,
  assessmentCount,
  cells,
  alignmentFilter,
  onSet,
}: {
  viewBy: ViewBy;
  clos: CloForm[];
  columns: MappingColumn[];
  weekCount: number;
  assessmentCount: number;
  cells: MappingForm;
  alignmentFilter: AlignmentFilter;
  onSet: (col: MappingColumn, cloCode: string, strength: number | null) => void;
}) {
  if (columns.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No columns to show — enable Weekly Plan or Assessments in Filter.</p>;
  }

  // "View by: Component" transposes the grid so components are the rows.
  if (viewBy === "component") {
    return (
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
              Component
            </th>
            {clos.map((clo) => (
              <th key={clo.code} className="px-1 py-2 text-center text-xs font-semibold text-primary">
                {clo.code}
              </th>
            ))}
            <th className="px-1 py-2 text-center text-xs font-semibold text-muted-foreground">Avg</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={`${col.kind}:${col.ref}`} className="border-b border-border/60">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium text-foreground" title={col.title}>
                {col.label}
              </th>
              {clos.map((clo) => {
                const strength = cellStrength(cells, col.kind, col.ref, clo.code);
                return (
                  <td key={clo.code} className="px-1 py-1.5">
                    <MatrixCell
                      strength={strength}
                      dimmed={!matchesFilter(strength, alignmentFilter)}
                      onSet={(s) => onSet(col, clo.code, s)}
                      label={`${clo.code} × ${col.label}`}
                    />
                  </td>
                );
              })}
              <AvgCell value={columnAverage(cells, col.kind, col.ref)} />
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Default "View by: CLO" — CLOs are the rows.
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th rowSpan={2} className="sticky left-0 z-10 bg-card px-3 py-2 text-left align-bottom">
            <div className="text-xs font-semibold text-foreground">CLOs</div>
            <div className="text-[10px] font-normal text-muted-foreground">Course Learning Outcomes</div>
          </th>
          {weekCount > 0 ? (
            <th colSpan={weekCount} className="border-b border-border px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground">
              Teaching &amp; Learning (Weekly Plan)
            </th>
          ) : null}
          {assessmentCount > 0 ? (
            <th colSpan={assessmentCount} className="border-b border-l border-border px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground">
              Assessments
            </th>
          ) : null}
        </tr>
        <tr className="border-b border-border">
          {columns.map((col, i) => (
            <th
              key={`${col.kind}:${col.ref}`}
              className={`px-1 py-2 text-center text-[11px] font-medium text-muted-foreground ${
                col.kind === "assessment" && (i === 0 || columns[i - 1]?.kind === "week") ? "border-l border-border" : ""
              }`}
              title={col.title}
            >
              <span className="block max-w-[64px] truncate">{col.label}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {clos.map((clo) => (
          <tr key={clo.code} className="border-b border-border/60 align-top">
            <th className="sticky left-0 z-10 bg-card px-3 py-3 text-left">
              <div className="text-sm font-semibold text-primary">{clo.code}</div>
              <div className="max-w-[220px] text-xs font-normal text-muted-foreground">{clo.description}</div>
            </th>
            {columns.map((col, i) => {
              const strength = cellStrength(cells, col.kind, col.ref, clo.code);
              return (
                <td
                  key={`${col.kind}:${col.ref}`}
                  className={`px-1 py-2 ${
                    col.kind === "assessment" && (i === 0 || columns[i - 1]?.kind === "week") ? "border-l border-border" : ""
                  }`}
                >
                  <MatrixCell
                    strength={strength}
                    dimmed={!matchesFilter(strength, alignmentFilter)}
                    onSet={(s) => onSet(col, clo.code, s)}
                    label={`${clo.code} × ${col.label}`}
                  />
                </td>
              );
            })}
          </tr>
        ))}
        <tr className="border-t-2 border-border font-medium">
          <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold text-foreground">
            Average Alignment
          </th>
          {columns.map((col) => (
            <AvgCell key={`${col.kind}:${col.ref}`} value={columnAverage(cells, col.kind, col.ref)} />
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------- sidebar */

function MappingSummary({ metrics }: { metrics: ReturnType<typeof mappingMetrics> }) {
  const total = metrics.ratedCount;
  const segments = metrics.distribution.map((d) => {
    const band = ALIGNMENT_STRENGTHS.find((s) => s.value === d.value)!;
    return { ...band, count: d.count, percent: total ? Math.round((d.count / total) * 100) : 0 };
  });
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Mapping Summary</h3>
      <div className="flex items-center gap-4">
        <Donut segments={segments} total={total} center={`${metrics.overallPercent}%`} caption="Overall Alignment" />
        <ul className="flex-1 space-y-2">
          {segments.map((s) => (
            <li key={s.code} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="font-medium text-foreground">
                  {s.name} ({s.count})
                </span>
              </div>
              <div className="pl-4.5 text-muted-foreground">{s.percent}%</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Donut({
  segments,
  total,
  center,
  caption,
}: {
  segments: { color: string; count: number }[];
  total: number;
  center: string;
  caption: string;
}) {
  const size = 120;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {total > 0 &&
          segments
            .filter((s) => s.count > 0)
            .map((s, i) => {
              const len = (s.count / total) * c;
              const dash = `${len} ${c - len}`;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-foreground">{center}</span>
        <span className="max-w-[70px] text-center text-[9px] leading-tight text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}

function AlignmentByClo({
  metrics,
  onViewReport,
}: {
  metrics: ReturnType<typeof mappingMetrics>;
  onViewReport: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Alignment by CLO (Average)</h3>
      <ul className="space-y-2.5">
        {metrics.perClo.map((row) => {
          const band = alignmentBand(row.average);
          return (
            <li key={row.code} className="flex items-center justify-between text-sm">
              <span className="font-medium text-primary">{row.code}</span>
              <span className="flex items-center gap-2 text-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: band?.color ?? "var(--muted)" }}
                />
                {row.average == null ? "–" : row.average.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onViewReport}
        className="mt-4 text-sm font-medium text-primary hover:underline"
      >
        View detailed alignment report →
      </button>
    </section>
  );
}

function QuickActions({
  onEdit,
  onReport,
  onHeatmap,
}: {
  onEdit: () => void;
  onReport: () => void;
  onHeatmap: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Quick Actions</h3>
      <div className="space-y-2">
        <ActionRow icon={Pencil} title="Edit Mapping" sub="View and edit CLO mappings" onClick={onEdit} />
        <ActionRow icon={FileText} title="Mapping Report" sub="View the alignment report" onClick={onReport} />
        <ActionRow icon={Grid3x3} title="Alignment Heatmap" sub="View heatmap visualization" onClick={onHeatmap} />
      </div>
    </section>
  );
}

function ActionRow({
  icon: Icon,
  title,
  sub,
  onClick,
}: {
  icon: typeof Target;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition hover:bg-muted/50"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------- dialogs */

function ReportDialog({
  open,
  onOpenChange,
  metrics,
  weekColumns,
  assessmentColumns,
  cells,
  courseName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  metrics: ReturnType<typeof mappingMetrics>;
  weekColumns: MappingColumn[];
  assessmentColumns: MappingColumn[];
  cells: MappingForm;
  courseName?: string;
}) {
  const unratedClos = metrics.perClo.filter((c) => c.average == null).map((c) => c.code);
  const weakClos = metrics.perClo.filter((c) => c.average != null && c.average < 1.5).map((c) => c.code);
  const unmappedWeeks = weekColumns.length - metrics.weeksMapped;
  const unmappedAssessments = assessmentColumns.length - metrics.assessmentsMapped;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alignment Report</DialogTitle>
          <DialogDescription>{courseName ?? "This course"} — CLO alignment across teaching &amp; assessment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <ReportStat label="Overall alignment" value={`${metrics.overallPercent}%`} />
            <ReportStat label="Rated cells" value={metrics.ratedCount} />
            <ReportStat label="Weeks mapped" value={`${metrics.weeksMapped}/${metrics.weeksTotal}`} />
            <ReportStat label="Assessments mapped" value={`${metrics.assessmentsMapped}/${metrics.assessmentsTotal}`} />
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Average by CLO
            </h4>
            <ul className="space-y-1.5">
              {metrics.perClo.map((row) => {
                const band = alignmentBand(row.average);
                return (
                  <li key={row.code} className="flex items-center justify-between">
                    <span className="font-medium text-primary">{row.code}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band?.color ?? "var(--muted)" }} />
                      {row.average == null ? "Not rated" : `${row.average.toFixed(1)} — ${band?.name}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {(unratedClos.length > 0 || weakClos.length > 0 || unmappedWeeks > 0 || unmappedAssessments > 0) && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 dark:bg-amber-950/20">
              <h4 className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">Attention</h4>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {unratedClos.length > 0 ? <li>Not yet rated: {unratedClos.join(", ")}</li> : null}
                {weakClos.length > 0 ? <li>Weak alignment (&lt; 1.5): {weakClos.join(", ")}</li> : null}
                {unmappedWeeks > 0 ? <li>{unmappedWeeks} week(s) have no aligned CLO.</li> : null}
                {unmappedAssessments > 0 ? <li>{unmappedAssessments} assessment(s) have no aligned CLO.</li> : null}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function HeatmapDialog({
  open,
  onOpenChange,
  clos,
  columns,
  cells,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clos: CloForm[];
  columns: MappingColumn[];
  cells: MappingForm;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Alignment Heatmap</DialogTitle>
          <DialogDescription>Darker cells indicate stronger CLO alignment.</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1" />
                {columns.map((col) => (
                  <th key={`${col.kind}:${col.ref}`} className="px-1 py-1 text-center font-medium text-muted-foreground" title={col.title}>
                    <span className="block max-w-[54px] truncate">{col.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clos.map((clo) => (
                <tr key={clo.code}>
                  <th className="px-2 py-1 text-left font-semibold text-primary">{clo.code}</th>
                  {columns.map((col) => {
                    const s = cellStrength(cells, col.kind, col.ref, clo.code);
                    const band = alignmentBand(s);
                    return (
                      <td key={`${col.kind}:${col.ref}`} className="p-0.5">
                        <div
                          className="h-7 w-8 rounded"
                          title={`${clo.code} × ${col.label}: ${band ? band.name : "unrated"}`}
                          style={{
                            backgroundColor: band
                              ? tint(band.color, s === 0 ? 0.15 : 0.25 + (s ?? 0) * 0.22)
                              : "var(--muted)",
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------- empty */

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
