"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CourseSpecCompetencyAlignment,
  CourseSpecCompetencyAlignmentItem,
  CourseSpecCompetencyEvidenceStatus,
  CurriculumCompetencyLevel,
} from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dse-pms/ui";
import {
  AlertTriangle,
  CheckCircle2,
  GraduationCap,
  Link2,
  Loader2,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { courseSpecApi } from "@/lib/course-spec";
import type { CloForm } from "./clo-model";

function shortLevel(level: CurriculumCompetencyLevel | null) {
  if (!level) return "—";
  if (level === "Basic") return "B";
  if (level === "Intermediate") return "I";
  return "A";
}

function ExpectationTokens({ item }: { item: CourseSpecCompetencyAlignmentItem }) {
  const values = [
    ["T", item.expectation.teachLevel],
    ["U", item.expectation.useLevel],
    ["A", item.expectation.assessLevel],
  ] as const;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map(([action, level]) => (
        <span
          key={action}
          className="rounded-md border bg-background px-2 py-1 text-xs font-semibold"
        >
          {action}:{shortLevel(level)}
        </span>
      ))}
    </div>
  );
}

function EvidenceStatus({
  label,
  status,
  count,
}: {
  label: string;
  status: CourseSpecCompetencyEvidenceStatus;
  count: number;
}) {
  if (status === "notExpected") {
    return (
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-xs font-semibold">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">Not expected</p>
      </div>
    );
  }
  const evidenced = status === "evidenced";
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2">
        {evidenced ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        )}
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {evidenced
          ? `${count} linked source${count === 1 ? "" : "s"}`
          : "Needs evidence"}
      </p>
    </div>
  );
}

function EvidenceEditor({
  item,
  clos,
  courseId,
  onSaved,
}: {
  item: CourseSpecCompetencyAlignmentItem;
  clos: CloForm[];
  courseId: string;
  onSaved: (next: CourseSpecCompetencyAlignment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeClos = useMemo(
    () => clos.filter((clo) => clo.status === "active"),
    [clos],
  );

  useEffect(() => {
    if (!open) return;
    setSelected(item.evidence?.linkedCloIds ?? []);
    setError(null);
  }, [open, item.evidence?.linkedCloIds]);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await courseSpecApi.saveCompetencyEvidence(
        courseId,
        item.expectation.competencyId,
        { cloIds: selected },
      );
      onSaved(next);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save competency evidence links",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Link2 className="h-4 w-4" />
        {item.evidence ? "Edit CLO links" : "Link CLO evidence"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {item.expectation.code} — {item.expectation.name}
            </DialogTitle>
            <DialogDescription>
              Select the existing CLOs that explicitly support this programme
              competency. T/U/A remains programme-owned and read-only.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/20 p-3">
            <ExpectationTokens item={item} />
            <p className="mt-2 text-xs text-muted-foreground">
              PMS checks traceability and source coverage. It does not decide
              whether evidence is academically sufficient for the stated level.
            </p>
          </div>

          <div className="space-y-2">
            {activeClos.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No active CLOs are available. Add or activate CLOs first.
              </p>
            ) : (
              activeClos.map((clo) => (
                <label
                  key={clo.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/30"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selected.includes(clo.id)}
                    onChange={() => toggle(clo.id)}
                  />
                  <span className="min-w-0">
                    <span className="font-semibold">{clo.code}</span>
                    <span className="ml-2 text-sm">
                      {clo.description || "No description"}
                    </span>
                    {clo.mappedPlos.length > 0 ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        PLOs: {clo.mappedPlos.join(", ")}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))
            )}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : selected.length === 0 ? "Clear links" : "Save links"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProgrammeCompetencyExpectations({
  courseId,
  clos,
  readOnly = false,
  onSummaryChange,
}: {
  courseId: string;
  clos: CloForm[];
  readOnly?: boolean;
  onSummaryChange?: (
    summary: CourseSpecCompetencyAlignment["summary"] | null,
  ) => void;
}) {
  const [data, setData] = useState<CourseSpecCompetencyAlignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void courseSpecApi
      .competencyEvidence(courseId)
      .then((next) => {
        if (!active) return;
        setData(next);
        onSummaryChange?.(next.summary);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load programme competency expectations",
        );
        onSummaryChange?.(null);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [courseId, onSummaryChange]);

  const update = (next: CourseSpecCompetencyAlignment) => {
    setData(next);
    onSummaryChange?.(next.summary);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Programme Competency Expectations</h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Programme-owned Teach / Use / Assess expectations. Link existing CLOs;
            source evidence is derived from the saved Course Specification.
          </p>
        </div>
        {loading ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </span>
        ) : data?.context.source ? (
          <div className="text-right text-xs text-muted-foreground">
            <div>
              Curriculum {data.context.source.curriculumVersion} ·{" "}
              {data.context.source.curriculumStatus}
            </div>
            <div>
              {data.context.source.frameworkName} · v
              {data.context.source.frameworkVersion}
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!loading && data && data.context.state !== "ready" ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">
                {data.context.state === "ambiguous"
                  ? "Curriculum context needs review"
                  : "Programme mapping not available"}
              </p>
              <p className="mt-1 text-xs">{data.context.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && data?.context.state === "ready" && data.items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          No competency mapping is recorded for this course in the selected curriculum.
        </div>
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
            {[
              ["Expected", data.summary.expectedCompetencies],
              ["Evidenced", data.summary.evidencedCompetencies],
              ["Needs attention", data.summary.needsAttention],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border bg-background p-3">
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {data.items.map((item) => (
              <article
                key={item.expectation.competencyId}
                className="rounded-xl border bg-background/40 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {item.expectation.code} — {item.expectation.name}
                      </span>
                      {item.evidence?.stale ? (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                          Mapping changed · review links
                        </span>
                      ) : null}
                    </div>
                    {item.expectation.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.expectation.description}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <ExpectationTokens item={item} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      CLO evidence:{" "}
                      {item.evidence?.linkedCloCodes.length
                        ? item.evidence.linkedCloCodes.join(", ")
                        : "none linked"}
                    </p>
                  </div>
                  {!readOnly && data.context.state === "ready" ? (
                    <EvidenceEditor
                      item={item}
                      clos={clos}
                      courseId={courseId}
                      onSaved={update}
                    />
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <EvidenceStatus
                    label={`Teach ${item.expectation.teachLevel ?? ""}`.trim()}
                    status={item.teachStatus}
                    count={item.teachingWeeks.length}
                  />
                  <EvidenceStatus
                    label={`Use ${item.expectation.useLevel ?? ""}`.trim()}
                    status={item.useStatus}
                    count={item.applicationWeeks.length}
                  />
                  <EvidenceStatus
                    label={`Assess ${item.expectation.assessLevel ?? ""}`.trim()}
                    status={item.assessStatus}
                    count={item.assessments.length}
                  />
                </div>
              </article>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Evidence status confirms traceability only. Academic reviewers decide
            whether the linked work is sufficient for the stated Basic /
            Intermediate / Advanced level.
          </p>
        </>
      ) : null}
    </section>
  );
}
