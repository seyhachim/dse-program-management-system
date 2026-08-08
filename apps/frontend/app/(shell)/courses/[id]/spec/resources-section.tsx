"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Link2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@dse-pms/ui";
import type { WeeklyPlanForm } from "./weekly-plan-model";
import { teachingResourceLabel } from "./weekly-plan/week-form-fields";
import type { ResourcesForm } from "./resources-model";

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

  const addResource = (resourceType = "", evidenceWeekIds: string[] = []) => {
    setDraft((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        resourceType,
        title: resourceType ? teachingResourceLabel(resourceType) : "",
        url: "",
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Required Resources</h2>
          <p className="text-sm text-muted-foreground">
            Confirm the resources that must be available to deliver this course. Weekly Plan resources are suggestions, not automatic requirements.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Saving..." : "Save Resources"}
        </Button>
      </div>

      {suggestions.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Suggested from Weekly Plan</p>
              <p className="mt-1 text-xs text-muted-foreground">
                These candidates are derived from resource types already selected in the weekly plan. Add only the ones that are genuinely required.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => {
              const alreadyAdded = draft.some((item) => item.resourceType === suggestion.resourceType);
              return (
                <Button
                  key={suggestion.resourceType}
                  type="button"
                  variant={alreadyAdded ? "outline" : "secondary"}
                  size="sm"
                  disabled={alreadyAdded}
                  onClick={() => addResource(suggestion.resourceType, suggestion.weekIds)}
                >
                  {alreadyAdded ? "Added" : <Plus className="mr-1 h-3.5 w-3.5" />}
                  {suggestion.label}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => addResource()}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Required Resource
        </Button>
      </div>

      {draft.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <Link2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No required resources confirmed</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a suggested resource or create one manually. Saving an empty list records that no additional required resources have been confirmed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {draft.map((item, index) => (
            <section key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Resource {index + 1}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Confirmed required resource</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeResource(item.id)} aria-label="Remove resource">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">Resource Type</span>
                  <input
                    value={item.resourceType}
                    onChange={(event) => updateItem(item.id, { resourceType: event.target.value })}
                    placeholder="e.g. Software, Facility, Platform"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">Resource Name / Description</span>
                  <input
                    value={item.title}
                    onChange={(event) => updateItem(item.id, { title: event.target.value })}
                    placeholder="e.g. Computer laboratory with Python environment"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-foreground">Link (optional)</span>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={item.url}
                      onChange={(event) => updateItem(item.id, { url: event.target.value })}
                      placeholder="https://..."
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" aria-label="Open resource link" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-foreground">Notes</span>
                  <textarea
                    value={item.notes}
                    onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                    placeholder="Availability, access requirements, version, or other delivery notes"
                    className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>

              {weeklyPlan.length > 0 ? (
                <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs font-semibold text-foreground">Evidence from Weekly Plan</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select the weeks that support why this resource is required. This is provenance, not an automatic quality judgment.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {weeklyPlan.map((week) => {
                      const checked = item.evidenceWeekIds.includes(week.id);
                      const planned = week.teachingResourceTypes.includes(item.resourceType);
                      return (
                        <label key={week.id} className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs ${planned ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleEvidenceWeek(item.id, week.id)} className="mt-0.5" />
                          <span><strong>Week {week.week}</strong> — {week.topic || "Untitled week"}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-blue-200/70 bg-blue-50/50 px-3 py-2 text-xs text-muted-foreground dark:border-blue-900/40 dark:bg-blue-950/20">
        Weekly Plan provides candidate evidence. §19 records the lecturer-confirmed resources required to deliver the course. If evidence is missing, the system should surface that gap for review rather than infer poor teaching quality.
      </div>
    </div>
  );
}
