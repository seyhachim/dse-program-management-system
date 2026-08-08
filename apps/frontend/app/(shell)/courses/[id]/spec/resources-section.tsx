"use client";

import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@dse-pms/ui";
import type { CourseResourceKind } from "@dse-pms/shared-types";
import type { WeeklyPlanForm } from "./weekly-plan-model";
import { teachingResourceLabel } from "./weekly-plan/week-form-fields";
import {
  RESOURCE_KIND_LABELS,
  type ResourcesForm,
} from "./resources-model";

const KIND_OPTIONS = Object.entries(RESOURCE_KIND_LABELS) as [CourseResourceKind, string][];

export function ResourcesSectionForm({
  value,
  weeklyPlan,
  onPersist,
}: {
  value: ResourcesForm;
  weeklyPlan: WeeklyPlanForm;
  onPersist: (items: ResourcesForm) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ResourcesForm>(value);
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    return weeklyPlan.flatMap((week) =>
      week.teachingResourceTypes.flatMap((resourceType) => {
        if (seen.has(resourceType)) return [];
        seen.add(resourceType);
        return [{
          resourceType,
          label: teachingResourceLabel(resourceType),
          weekIds: weeklyPlan
            .filter((candidateWeek) => candidateWeek.teachingResourceTypes.includes(resourceType))
            .map((candidateWeek) => candidateWeek.id),
        }];
      }),
    );
  }, [weeklyPlan]);

  const updateItem = (id: string, patch: Partial<ResourcesForm[number]>) => {
    setDraft((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const addResource = (
    resourceType = "",
    evidenceWeekIds: string[] = [],
  ) => {
    setDraft((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: "requiredResource",
        resourceType: resourceType || "Manual",
        title: resourceType ? teachingResourceLabel(resourceType) : "",
        authors: "",
        publisher: "",
        year: "",
        isbn: "",
        url: "",
        basedOn: "",
        notes: "",
        evidenceWeekIds,
      },
    ]);
  };

  const removeResource = (id: string) => {
    setDraft((current) => current.filter((item) => item.id !== id));
  };

  const toggleEvidenceWeek = (id: string, weekId: string) => {
    const item = draft.find((candidate) => candidate.id === id);
    if (!item) return;
    const next = item.evidenceWeekIds.includes(weekId)
      ? item.evidenceWeekIds.filter((value) => value !== weekId)
      : [...item.evidenceWeekIds, weekId];
    updateItem(id, { evidenceWeekIds: next });
  };

  const save = async () => {
    setSaving(true);
    try {
      const ok = await onPersist(draft);
      if (ok) setDraft(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Resources</h2>
          <p className="text-sm text-muted-foreground">
            Manage course-level resources in one place. Weekly Plan resources are suggestions; you decide what becomes a confirmed resource.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Saving..." : "Save Resources"}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Suggested from Weekly Plan</p>
            <p className="mt-1 text-xs text-muted-foreground">
              These are candidates only. Click Add to confirm one, then choose its course-level category.
            </p>
          </div>
          <div className="mt-3 divide-y divide-border">
            {suggestions.map((suggestion) => {
              const alreadyAdded = draft.some(
                (item) => item.resourceType === suggestion.resourceType &&
                  item.evidenceWeekIds.some((weekId) => suggestion.weekIds.includes(weekId)),
              );
              return (
                <div key={suggestion.resourceType} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{suggestion.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Used in {suggestion.weekIds.map((id) => `Week ${weeklyPlan.find((week) => week.id === id)?.week ?? id}`).join(", ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={alreadyAdded ? "outline" : "secondary"}
                    size="sm"
                    disabled={alreadyAdded}
                    onClick={() => addResource(suggestion.resourceType, suggestion.weekIds)}
                  >
                    {alreadyAdded ? "Added" : <><Plus className="mr-1 h-3.5 w-3.5" /> Add</>}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => addResource()}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Resource Manually
        </Button>
      </div>

      {draft.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No resources confirmed</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a suggestion from the Weekly Plan or create a resource manually.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {draft.map((item, index) => {
            const isBook = item.kind === "requiredTextbook" || item.kind === "recommendedReading";
            return (
              <section key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Resource {index + 1}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {RESOURCE_KIND_LABELS[item.kind]}
                      {item.evidenceWeekIds.length ? ` · Evidence from ${item.evidenceWeekIds.length} week(s)` : ""}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeResource(item.id)} aria-label="Remove resource">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium">Category</span>
                    <select
                      value={item.kind}
                      onChange={(event) => updateItem(item.id, { kind: event.target.value as CourseResourceKind })}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      {KIND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium">Title / Resource Name</span>
                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} placeholder="e.g. An Introduction to Statistical Learning" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" />
                  </label>

                  {isBook && <>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium">Author(s)</span>
                      <input value={item.authors} onChange={(event) => updateItem(item.id, { authors: event.target.value })} placeholder="Author names" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" />
                    </label>
                    <label className="space-y-1"><span className="text-xs font-medium">Publisher</span><input value={item.publisher} onChange={(event) => updateItem(item.id, { publisher: event.target.value })} placeholder="Publisher" className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
                    <label className="space-y-1"><span className="text-xs font-medium">Year / Edition</span><input value={item.year} onChange={(event) => updateItem(item.id, { year: event.target.value })} placeholder="2023 (2nd Edition)" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" /></label>
                    <label className="space-y-1"><span className="text-xs font-medium">ISBN</span><input value={item.isbn} onChange={(event) => updateItem(item.id, { isbn: event.target.value })} placeholder="ISBN" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" /></label>
                  </>}

                  <label className="space-y-1">
                    <span className="text-xs font-medium">Link (optional)</span>
                    <div className="flex gap-2">
                      <input type="url" value={item.url} onChange={(event) => updateItem(item.id, { url: event.target.value })} placeholder="https://..." className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
                      {item.url && <a href={item.url} target="_blank" rel="noreferrer" aria-label="Open resource link" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"><ExternalLink className="h-4 w-4" /></a>}
                    </div>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium">Based on / Reference source (optional)</span>
                    <input value={item.basedOn} onChange={(event) => updateItem(item.id, { basedOn: event.target.value })} placeholder="e.g. ISLR, Chapter 3" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" />
                  </label>

                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium">Notes (optional)</span>
                    <textarea value={item.notes} onChange={(event) => updateItem(item.id, { notes: event.target.value })} placeholder="Short description or access notes" className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                  </label>

                  {weeklyPlan.length > 0 && (
                    <div className="md:col-span-2 rounded-lg border border-dashed border-border p-3">
                      <p className="text-xs font-medium">Weekly Plan evidence</p>
                      <p className="mt-1 text-xs text-muted-foreground">Optional. This records where the resource is used; it does not decide whether the resource is required.</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {weeklyPlan.map((week) => (
                          <label key={week.id} className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={item.evidenceWeekIds.includes(week.id)} onChange={() => toggleEvidenceWeek(item.id, week.id)} />
                            Week {week.week}: {week.topic || "Untitled"}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="flex justify-end border-t pt-4">
        <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Resources"}</Button>
      </div>
    </div>
  );
}
