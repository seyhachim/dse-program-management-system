"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_RUBRIC_LEVELS,
  RUBRIC_STATUSES,
  RUBRIC_TYPES,
  rubricScaleSummary,
  type CreateRubricInput,
  type Rubric,
  type RubricCriterion,
  type RubricLevel,
  type RubricStatus,
  type RubricType,
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
  StatusBadge,
} from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  canArchiveRubric,
  canDeleteRubric,
  canEditRubric,
  canManageRubric,
  rubricLockLabel,
  rubricStatusTone,
  rubricsApi,
  typeChipClass,
} from "@/lib/rubrics";

const newCriterion = (): RubricCriterion => ({
  id: crypto.randomUUID(),
  name: "",
  descriptors: DEFAULT_RUBRIC_LEVELS.map(() => ""),
});

const emptyDraft = (): CreateRubricInput => ({
  name: "",
  type: RUBRIC_TYPES[0],
  description: "",
  levels: DEFAULT_RUBRIC_LEVELS.map((level) => ({ ...level })),
  criteria: [newCriterion()],
  status: "Draft",
});

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function RubricBankClient() {
  const { me } = useMe();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | RubricStatus>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rubric | null>(null);
  const [draft, setDraft] = useState<CreateRubricInput>(emptyDraft);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const canWrite = me?.permissions.includes("rubrics:write") ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await rubricsApi.list({
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(status ? { status } : {}),
      });
      setRubrics(rows);
    } catch (err) {
      setError(errorMessage(err, "Failed to load rubrics"));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const currentOnly = useMemo(
    () => (status ? rubrics : rubrics.filter((rubric) => rubric.status !== "Archived")),
    [rubrics, status],
  );

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setMutationError(null);
    setDialogOpen(true);
  };

  const openEdit = (rubric: Rubric) => {
    setEditing(rubric);
    setDraft({
      name: rubric.name,
      type: rubric.type,
      description: rubric.description,
      levels: rubric.levels.map((level) => ({ ...level })),
      criteria: rubric.criteria.map((criterion) => ({
        ...criterion,
        descriptors: [...criterion.descriptors],
      })),
      status: rubric.status,
    });
    setMutationError(null);
    setDialogOpen(true);
  };

  const setLevel = (index: number, patch: Partial<RubricLevel>) => {
    setDraft((current) => {
      const levels = current.levels.map((level, i) => (i === index ? { ...level, ...patch } : level));
      return { ...current, levels };
    });
  };

  const addLevel = () => {
    setDraft((current) => ({
      ...current,
      levels: [...current.levels, { label: "New level", points: 0 }],
      criteria: current.criteria.map((criterion) => ({
        ...criterion,
        descriptors: [...criterion.descriptors, ""],
      })),
    }));
  };

  const removeLevel = (index: number) => {
    setDraft((current) => {
      if (current.levels.length <= 1) return current;
      return {
        ...current,
        levels: current.levels.filter((_, i) => i !== index),
        criteria: current.criteria.map((criterion) => ({
          ...criterion,
          descriptors: criterion.descriptors.filter((_, i) => i !== index),
        })),
      };
    });
  };

  const setCriterion = (index: number, patch: Partial<RubricCriterion>) => {
    setDraft((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, i) => (i === index ? { ...criterion, ...patch } : criterion)),
    }));
  };

  const setDescriptor = (criterionIndex: number, levelIndex: number, value: string) => {
    setDraft((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, i) => {
        if (i !== criterionIndex) return criterion;
        const descriptors = [...criterion.descriptors];
        descriptors[levelIndex] = value;
        return { ...criterion, descriptors };
      }),
    }));
  };

  const addCriterion = () => {
    setDraft((current) => ({
      ...current,
      criteria: [
        ...current.criteria,
        { id: crypto.randomUUID(), name: "", descriptors: current.levels.map(() => "") },
      ],
    }));
  };

  const removeCriterion = (index: number) => {
    setDraft((current) => current.criteria.length <= 1
      ? current
      : { ...current, criteria: current.criteria.filter((_, i) => i !== index) });
  };

  const save = async () => {
    setSaving(true);
    setMutationError(null);
    try {
      if (editing) {
        await rubricsApi.update(editing.id, draft);
      } else {
        await rubricsApi.create(draft);
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      setMutationError(errorMessage(err, "Failed to save rubric"));
    } finally {
      setSaving(false);
    }
  };

  const publish = async (rubric: Rubric) => {
    if (!window.confirm(`Publish “${rubric.name}”? Published scoring content becomes immutable.`)) return;
    try {
      await rubricsApi.update(rubric.id, { status: "Active" });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to publish rubric"));
    }
  };

  const archive = async (rubric: Rubric) => {
    if (!window.confirm(`Archive “${rubric.name}”? Existing academic references will be preserved.`)) return;
    try {
      await rubricsApi.archive(rubric.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to archive rubric"));
    }
  };

  const remove = async (rubric: Rubric) => {
    if (!window.confirm(`Delete draft rubric “${rubric.name}”? This is only allowed when it is unused.`)) return;
    try {
      await rubricsApi.remove(rubric.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to delete rubric"));
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-semibold text-foreground">Reusable assessment rubrics</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Active rubrics are available to Course Specification assessments. Once published, scoring content is locked; archive instead of rewriting academic history.
            </p>
          </div>
          {canWrite ? (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New rubric
            </Button>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, description, or type"
            className="sm:max-w-md"
            aria-label="Search rubrics"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "" | RubricStatus)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            aria-label="Filter rubric status"
          >
            <option value="">Current (Draft + Active)</option>
            {RUBRIC_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {error ? <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
        {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading rubrics…</div> : null}
        {!loading && currentOnly.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No rubrics match this view.</div>
        ) : null}

        {!loading && currentOnly.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Rubric</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Scale</th>
                  <th className="px-4 py-3 font-medium">Usage</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentOnly.map((rubric) => {
                  const manageable = canManageRubric(me, rubric);
                  const lock = rubricLockLabel(rubric);
                  return (
                    <tr key={rubric.id} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-medium text-foreground">{rubric.name}</div>
                        <div className="mt-1 max-w-md text-xs text-muted-foreground">{rubric.description || "No description"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{rubric.criteria.length} criteria{lock ? ` · ${lock}` : ""}</div>
                      </td>
                      <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-medium ${typeChipClass(rubric.type)}`}>{rubric.type}</span></td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">{rubricScaleSummary(rubric.levels)}</td>
                      <td className="px-4 py-4">{rubric.assessmentUsageCount ?? 0}</td>
                      <td className="px-4 py-4"><StatusBadge tone={rubricStatusTone(rubric.status)}>{rubric.status}</StatusBadge></td>
                      <td className="px-4 py-4 text-muted-foreground">{rubric.owner?.name ?? "—"}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-1">
                          {rubric.status === "Active" ? (
                            <Button asChild variant="ghost" size="sm"><a href={`/rubrics/${rubric.id}`} target="_blank" rel="noreferrer" aria-label={`View ${rubric.name}`}><Eye className="h-4 w-4" /></a></Button>
                          ) : null}
                          {canEditRubric(me, rubric) ? (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(rubric)} aria-label={`Edit ${rubric.name}`}><Pencil className="h-4 w-4" /></Button>
                          ) : null}
                          {manageable && rubric.status === "Draft" ? (
                            <Button variant="outline" size="sm" onClick={() => void publish(rubric)}>Publish</Button>
                          ) : null}
                          {canArchiveRubric(me, rubric) ? (
                            <Button variant="ghost" size="sm" onClick={() => void archive(rubric)} aria-label={`Archive ${rubric.name}`}><Archive className="h-4 w-4" /></Button>
                          ) : null}
                          {canDeleteRubric(me, rubric) ? (
                            <Button variant="ghost" size="sm" onClick={() => void remove(rubric)} aria-label={`Delete ${rubric.name}`}><Trash2 className="h-4 w-4" /></Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rubric" : "Create rubric"}</DialogTitle>
            <DialogDescription>
              Save scoring content as Draft first. Publish only when the rubric is ready for Course Specification use.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rubric-name">Name</Label>
                <Input id="rubric-name" value={draft.name} onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rubric-type">Assessment type</Label>
                <select id="rubric-type" value={draft.type} onChange={(e) => setDraft((current) => ({ ...current, type: e.target.value as RubricType }))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  {RUBRIC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rubric-description">Description</Label>
              <textarea id="rubric-description" value={draft.description} onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div><h3 className="font-medium text-foreground">Rating levels</h3><p className="text-xs text-muted-foreground">Ordered left-to-right in the scoring grid.</p></div>
                <Button variant="outline" size="sm" onClick={addLevel} type="button"><Plus className="mr-1 h-4 w-4" /> Level</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {draft.levels.map((level, index) => (
                  <div key={`${index}-${level.label}`} className="flex gap-2 rounded-md border border-border p-3">
                    <Input value={level.label} onChange={(e) => setLevel(index, { label: e.target.value })} aria-label={`Level ${index + 1} label`} />
                    <Input type="number" min="0" step="0.5" value={level.points} onChange={(e) => setLevel(index, { points: Number(e.target.value) })} className="w-24" aria-label={`Level ${index + 1} points`} />
                    <Button variant="ghost" size="sm" onClick={() => removeLevel(index)} disabled={draft.levels.length <= 1} aria-label={`Remove level ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div><h3 className="font-medium text-foreground">Criteria and descriptors</h3><p className="text-xs text-muted-foreground">Each criterion requires one descriptor for every rating level.</p></div>
                <Button variant="outline" size="sm" onClick={addCriterion} type="button"><Plus className="mr-1 h-4 w-4" /> Criterion</Button>
              </div>
              {draft.criteria.map((criterion, criterionIndex) => (
                <div key={criterion.id} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex gap-2">
                    <Input value={criterion.name} onChange={(e) => setCriterion(criterionIndex, { name: e.target.value })} placeholder={`Criterion ${criterionIndex + 1}`} aria-label={`Criterion ${criterionIndex + 1} name`} />
                    <Button variant="ghost" size="sm" onClick={() => removeCriterion(criterionIndex)} disabled={draft.criteria.length <= 1} aria-label={`Remove criterion ${criterionIndex + 1}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {draft.levels.map((level, levelIndex) => (
                      <div key={`${criterion.id}-${levelIndex}`} className="space-y-1">
                        <Label className="text-xs">{level.points} · {level.label}</Label>
                        <textarea value={criterion.descriptors[levelIndex] ?? ""} onChange={(e) => setDescriptor(criterionIndex, levelIndex, e.target.value)} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" aria-label={`${criterion.name || `Criterion ${criterionIndex + 1}`} descriptor for ${level.label}`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {mutationError ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{mutationError}</div> : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={() => void save()} disabled={saving || !draft.name.trim() || draft.criteria.some((criterion) => !criterion.name.trim())}>{saving ? "Saving…" : editing ? "Save draft" : "Create draft"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
