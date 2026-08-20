"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, History, Pencil, Plus, RefreshCw } from "lucide-react";
import type {
  CreateProgrammeGradingScaleInput,
  DraftGradingScaleGradeInput,
  ProgrammeGradingScale,
  ProgrammeGradingScaleVersion,
} from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  canApproveGradingScaleVersion,
  canCreateGradingScaleRevision,
  canEditGradingScaleVersion,
  canManageGradingScales,
} from "@/lib/grading-scale-permissions";
import { gradingScalesApi } from "@/lib/grading-scales";

const PROGRAMME_ID = "dse";

type GradeDraft = {
  letterGrade: string;
  gradePoint: string;
  minScore: string;
  maxScore: string;
  minInclusive: boolean;
  maxInclusive: boolean;
  explanation: string;
  isPassing: boolean;
};

type ScaleDraft = {
  code: string;
  name: string;
  description: string;
  effectiveFrom: string;
  changeSummary: string;
  grades: GradeDraft[];
};

type RevisionDraft = { effectiveFrom: string; changeSummary: string };

function blankGrade(): GradeDraft {
  return {
    letterGrade: "",
    gradePoint: "0",
    minScore: "0",
    maxScore: "100",
    minInclusive: true,
    maxInclusive: false,
    explanation: "",
    isPassing: true,
  };
}

function blankScale(): ScaleDraft {
  return {
    code: "",
    name: "",
    description: "",
    effectiveFrom: "",
    changeSummary: "Initial grading scale",
    grades: [blankGrade()],
  };
}

function versionToDraft(version: ProgrammeGradingScaleVersion): ScaleDraft {
  return {
    code: version.code,
    name: version.name,
    description: version.description,
    effectiveFrom: version.effectiveFrom ?? "",
    changeSummary: version.changeSummary,
    grades: version.grades.map((grade) => ({
      letterGrade: grade.letterGrade,
      gradePoint: String(grade.gradePoint),
      minScore: String(grade.minScore),
      maxScore: String(grade.maxScore),
      minInclusive: grade.minInclusive,
      maxInclusive: grade.maxInclusive,
      explanation: grade.explanation,
      isPassing: grade.isPassing,
    })),
  };
}

function gradePayload(grades: GradeDraft[]): DraftGradingScaleGradeInput[] {
  return grades.map((grade, index) => ({
    sortOrder: index + 1,
    letterGrade: grade.letterGrade.trim(),
    gradePoint: Number(grade.gradePoint),
    minScore: Number(grade.minScore),
    maxScore: Number(grade.maxScore),
    minInclusive: grade.minInclusive,
    maxInclusive: grade.maxInclusive,
    explanation: grade.explanation.trim(),
    isPassing: grade.isPassing,
  }));
}

function message(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "You do not have permission to manage Rating Scales for this programme.";
    if (error.status === 404) return "This Rating Scale no longer exists. Refresh and try again.";
    return error.message || fallback;
  }
  return fallback;
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00.000Z`),
  );
}

function statusClass(status: ProgrammeGradingScaleVersion["status"]): string {
  if (status === "Approved") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "Superseded") return "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function GradeTable({ version }: { version: ProgrammeGradingScaleVersion }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Grade</th>
            <th className="px-3 py-2">Score</th>
            <th className="px-3 py-2">GPA</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {version.grades.map((grade) => (
            <tr key={grade.id} className="border-t border-border">
              <td className="px-3 py-2 font-semibold">{grade.letterGrade}</td>
              <td className="px-3 py-2 tabular-nums">{grade.scoreLabel}</td>
              <td className="px-3 py-2 tabular-nums">{grade.gradePoint.toFixed(2)}</td>
              <td className="px-3 py-2 text-muted-foreground">{grade.explanation || "—"}</td>
              <td className="px-3 py-2">{grade.isPassing ? "Pass" : "Fail"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GradeEditor({
  grades,
  onChange,
}: {
  grades: GradeDraft[];
  onChange: (next: GradeDraft[]) => void;
}) {
  const update = (index: number, patch: Partial<GradeDraft>) => {
    onChange(grades.map((grade, i) => (i === index ? { ...grade, ...patch } : grade)));
  };
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= grades.length) return;
    const next = [...grades];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Grade bands</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...grades, blankGrade()])}>
          <Plus className="mr-1 h-4 w-4" /> Add grade
        </Button>
      </div>
      {grades.map((grade, index) => (
        <div key={index} className="rounded-lg border border-border p-3">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-xs font-medium">Grade
              <Input value={grade.letterGrade} onChange={(e) => update(index, { letterGrade: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Grade point
              <Input type="number" step="0.01" min="0" value={grade.gradePoint} onChange={(e) => update(index, { gradePoint: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Minimum
              <Input type="number" min="0" max="100" value={grade.minScore} onChange={(e) => update(index, { minScore: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Maximum
              <Input type="number" min="0" max="100" value={grade.maxScore} onChange={(e) => update(index, { maxScore: e.target.value })} />
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="space-y-1 text-xs font-medium">Explanation
              <Input value={grade.explanation} onChange={(e) => update(index, { explanation: e.target.value })} />
            </label>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" checked={grade.minInclusive} onChange={(e) => update(index, { minInclusive: e.target.checked })} /> Min inclusive</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={grade.maxInclusive} onChange={(e) => update(index, { maxInclusive: e.target.checked })} /> Max inclusive</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={grade.isPassing} onChange={(e) => update(index, { isPassing: e.target.checked })} /> Passing</label>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${grade.letterGrade || "grade"} up`}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" variant="outline" size="sm" disabled={index === grades.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${grade.letterGrade || "grade"} down`}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" variant="outline" size="sm" disabled={grades.length === 1} onClick={() => onChange(grades.filter((_, i) => i !== index))}>Remove</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RatingScalesClient() {
  const { me, loading: meLoading } = useMe();
  const [scales, setScales] = useState<ProgrammeGradingScale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<ProgrammeGradingScaleVersion | null>(null);
  const [draft, setDraft] = useState<ScaleDraft>(blankScale);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [approveVersion, setApproveVersion] = useState<ProgrammeGradingScaleVersion | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const [revisionVersion, setRevisionVersion] = useState<ProgrammeGradingScaleVersion | null>(null);
  const [revisionDraft, setRevisionDraft] = useState<RevisionDraft>({ effectiveFrom: "", changeSummary: "" });
  const [revisionError, setRevisionError] = useState<string | null>(null);

  const manager = me ? canManageGradingScales(me.roles) : false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setScales(await gradingScalesApi.list(PROGRAMME_ID));
    } catch (err) {
      setError(message(err, "Failed to load Rating Scales"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!meLoading && manager) void load();
    else if (!meLoading) setLoading(false);
  }, [load, manager, meLoading]);

  const draftCount = useMemo(
    () => scales.reduce((count, scale) => count + scale.versions.filter((version) => version.status === "Draft").length, 0),
    [scales],
  );

  const openCreate = () => {
    setEditingVersion(null);
    setDraft(blankScale());
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEdit = (version: ProgrammeGradingScaleVersion) => {
    setEditingVersion(version);
    setDraft(versionToDraft(version));
    setEditorError(null);
    setEditorOpen(true);
  };

  const validateDraft = (): string | null => {
    if (!editingVersion && (!draft.code.trim() || !draft.name.trim())) return "Code and name are required.";
    if (!draft.changeSummary.trim()) return "Change summary is required.";
    if (!draft.grades.length) return "At least one grade band is required.";
    for (const grade of draft.grades) {
      if (!grade.letterGrade.trim()) return "Every grade band needs a grade label.";
      const values = [grade.gradePoint, grade.minScore, grade.maxScore].map(Number);
      if (values.some((value) => !Number.isFinite(value))) return "Grade point and score boundaries must be valid numbers.";
    }
    return null;
  };

  const saveDraft = async () => {
    const validation = validateDraft();
    if (validation) return setEditorError(validation);
    setSaving(true);
    setEditorError(null);
    try {
      const grades = gradePayload(draft.grades);
      if (editingVersion) {
        await gradingScalesApi.updateDraft(editingVersion.id, {
          effectiveFrom: draft.effectiveFrom || null,
          changeSummary: draft.changeSummary.trim(),
          grades,
        });
      } else {
        const input: CreateProgrammeGradingScaleInput = {
          programmeId: PROGRAMME_ID,
          code: draft.code.trim(),
          name: draft.name.trim(),
          description: draft.description.trim(),
          effectiveFrom: draft.effectiveFrom || null,
          changeSummary: draft.changeSummary.trim(),
          grades,
        };
        await gradingScalesApi.create(input);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      setEditorError(message(err, "Failed to save Rating Scale draft"));
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!approveVersion) return;
    setApprovalError(null);
    try {
      await gradingScalesApi.approve(approveVersion.id, { note: approvalNote.trim() });
      setApproveVersion(null);
      setApprovalNote("");
      await load();
    } catch (err) {
      setApprovalError(message(err, "Failed to approve Rating Scale"));
    }
  };

  const createRevision = async () => {
    if (!revisionVersion) return;
    if (!revisionDraft.changeSummary.trim()) return setRevisionError("Change summary is required.");
    setRevisionError(null);
    try {
      await gradingScalesApi.createRevision(revisionVersion.gradingScaleId, {
        effectiveFrom: revisionDraft.effectiveFrom || null,
        changeSummary: revisionDraft.changeSummary.trim(),
      });
      setRevisionVersion(null);
      setRevisionDraft({ effectiveFrom: "", changeSummary: "" });
      await load();
    } catch (err) {
      setRevisionError(message(err, "Failed to create Rating Scale revision"));
    }
  };

  if (meLoading || loading) {
    return <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading Rating Scales…</div>;
  }

  if (!manager) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">You do not have permission to manage Rating Scales.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Programme grading policy</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Rating Scales are programme-owned, versioned policy. Approved and Superseded versions are immutable; changes must be made through a new Draft revision.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Rating Scale</Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-1">Programme: DSE</span>
          <span className="rounded-full border border-border px-2 py-1">{scales.length} scale{scales.length === 1 ? "" : "s"}</span>
          <span className="rounded-full border border-border px-2 py-1">{draftCount} draft{draftCount === 1 ? "" : "s"}</span>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

      {scales.length === 0 && !error ? (
        <section className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <h3 className="font-semibold">No Rating Scales yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create the programme’s first governed grading policy as a Draft.</p>
          <Button className="mt-4" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create Rating Scale</Button>
        </section>
      ) : null}

      {scales.map((scale) => {
        const draftVersion = scale.versions.find((version) => version.status === "Draft");
        const currentApproved = scale.versions.find((version) => version.status === "Approved");
        return (
          <section key={scale.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{scale.name}</h3>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{scale.code}</code>
                  {scale.isDefault ? <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Default</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{scale.description || "No description"}</p>
                <p className="mt-2 text-xs text-muted-foreground">Current policy: {currentApproved ? `v${currentApproved.version} · effective ${formatDate(currentApproved.effectiveFrom)}` : "No approved version"}</p>
              </div>
              {draftVersion ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">Draft v{draftVersion.version} in progress</span> : null}
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />Version history</div>
              {scale.versions.map((version) => {
                const editable = me ? canEditGradingScaleVersion(me.roles, version) : false;
                const approvable = me ? canApproveGradingScaleVersion(me.roles, version) : false;
                const revisable = me ? canCreateGradingScaleRevision(me.roles, version) && !draftVersion : false;
                return (
                  <details key={version.id} className="group rounded-lg border border-border" open={version.status === "Draft" || version.status === "Approved"}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>v{version.version}</strong>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(version.status)}`}>{version.status}</span>
                        {version.legacyImported ? <span className="text-xs text-muted-foreground">Legacy baseline</span> : null}
                        <span className="text-xs text-muted-foreground">Effective {formatDate(version.effectiveFrom)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{version.changeSummary}</span>
                    </summary>
                    <div className="border-t border-border p-4">
                      <GradeTable version={version} />
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          {version.status === "Superseded" && version.effectiveTo ? `Historical until ${formatDate(version.effectiveTo)}` : null}
                          {version.approvedAt ? ` Approved ${formatDate(version.approvedAt)}` : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {editable ? <Button variant="outline" size="sm" onClick={() => openEdit(version)}><Pencil className="mr-1 h-4 w-4" />Edit Draft</Button> : null}
                          {approvable ? <Button size="sm" onClick={() => { setApproveVersion(version); setApprovalNote(""); setApprovalError(null); }}><CheckCircle2 className="mr-1 h-4 w-4" />Approve</Button> : null}
                          {revisable ? <Button variant="outline" size="sm" onClick={() => { setRevisionVersion(version); setRevisionDraft({ effectiveFrom: "", changeSummary: "" }); setRevisionError(null); }}>Create revision</Button> : null}
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVersion ? `Edit ${editingVersion.name} v${editingVersion.version}` : "Create Rating Scale"}</DialogTitle>
            <DialogDescription>{editingVersion ? "Only Draft policy can be changed. Approval will lock these grade bands." : "Create a programme-owned v1 Draft. It will not become policy until approved."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingVersion ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1"><Label>Code</Label><Input value={draft.code} onChange={(e) => setDraft((value) => ({ ...value, code: e.target.value }))} /></label>
                <label className="space-y-1"><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft((value) => ({ ...value, name: e.target.value }))} /></label>
              </div>
            ) : null}
            {!editingVersion ? <label className="block space-y-1"><Label>Description</Label><textarea className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={draft.description} onChange={(e) => setDraft((value) => ({ ...value, description: e.target.value }))} /></label> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1"><Label>Effective from</Label><Input type="date" value={draft.effectiveFrom} onChange={(e) => setDraft((value) => ({ ...value, effectiveFrom: e.target.value }))} /></label>
              <label className="space-y-1"><Label>Change summary</Label><Input value={draft.changeSummary} onChange={(e) => setDraft((value) => ({ ...value, changeSummary: e.target.value }))} /></label>
            </div>
            <GradeEditor grades={draft.grades} onChange={(grades) => setDraft((value) => ({ ...value, grades }))} />
            {editorError ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{editorError}</div> : null}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : editingVersion ? "Save Draft" : "Create Draft"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(approveVersion)} onOpenChange={(open) => !open && setApproveVersion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Rating Scale v{approveVersion?.version}</DialogTitle>
            <DialogDescription>Approval makes this version programme policy. The previous Approved version may become Superseded, and approved grade rows cannot be edited. Existing Course Specifications remain pinned to their historical versions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm"><strong>Effective from:</strong> {formatDate(approveVersion?.effectiveFrom ?? null)}</div>
            <label className="block space-y-1"><Label>Approval note</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} /></label>
            {approvalError ? <div className="text-sm text-destructive">{approvalError}</div> : null}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setApproveVersion(null)}>Cancel</Button><Button onClick={() => void approve()}>Approve version</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revisionVersion)} onOpenChange={(open) => !open && setRevisionVersion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create revision from v{revisionVersion?.version}</DialogTitle>
            <DialogDescription>The approved source stays unchanged. Its grade bands are copied into the next Draft version.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1"><Label>Effective from</Label><Input type="date" value={revisionDraft.effectiveFrom} onChange={(e) => setRevisionDraft((value) => ({ ...value, effectiveFrom: e.target.value }))} /></label>
            <label className="block space-y-1"><Label>Change summary</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={revisionDraft.changeSummary} onChange={(e) => setRevisionDraft((value) => ({ ...value, changeSummary: e.target.value }))} /></label>
            {revisionError ? <div className="text-sm text-destructive">{revisionError}</div> : null}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRevisionVersion(null)}>Cancel</Button><Button onClick={() => void createRevision()}>Create Draft revision</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
