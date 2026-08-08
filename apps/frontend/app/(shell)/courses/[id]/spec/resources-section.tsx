"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Link2, Save } from "lucide-react";
import { Button } from "@dse-pms/ui";
import type { WeeklyPlanForm } from "./weekly-plan-model";
import {
  teachingResourceLabel,
} from "./weekly-plan/week-form-fields";
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

  const slots = useMemo(
    () =>
      weeklyPlan.flatMap((week) =>
        week.teachingResourceTypes.map((resourceType) => ({
          weekId: week.id,
          week: week.week,
          topic: week.topic,
          resourceType,
        })),
      ),
    [weeklyPlan],
  );

  const getItem = (weekId: string, resourceType: string) =>
    draft.find(
      (item) =>
        item.weekId === weekId && item.resourceType === resourceType,
    );

  const updateSlot = (
    weekId: string,
    resourceType: string,
    patch: Partial<Pick<ResourcesForm[number], "title" | "url" | "notes">>,
  ) => {
    setDraft((current) => {
      const index = current.findIndex(
        (item) =>
          item.weekId === weekId && item.resourceType === resourceType,
      );

      if (index < 0) {
        return [
          ...current,
          {
            id: crypto.randomUUID(),
            weekId,
            resourceType,
            title: "",
            url: "",
            notes: "",
            ...patch,
          },
        ];
      }

      return current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      );
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onPersist(draft);
    } finally {
      setSaving(false);
    }
  };

  const completed = slots.filter((slot) => {
    const item = getItem(slot.weekId, slot.resourceType);
    return Boolean(item?.title.trim() || item?.url.trim());
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Resources</h2>
          <p className="text-sm text-muted-foreground">
            Add the actual teaching materials and links for resources planned in the Weekly Plan.
          </p>
        </div>

        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Saving..." : "Save Resources"}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Resource Evidence
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {completed} of {slots.length} planned resource slots have material details.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
            {slots.length ? Math.round((completed / slots.length) * 100) : 0}%
          </span>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <Link2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No teaching resources are planned yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Select resource types in Weekly Plan first. They will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {weeklyPlan
            .filter((week) => week.teachingResourceTypes.length > 0)
            .map((week) => (
              <section
                key={week.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="border-b border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground">
                      Week {week.week}
                    </span>
                    <p className="text-sm font-semibold text-foreground">
                      {week.topic || "Untitled week"}
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {week.teachingResourceTypes.map((resourceType) => {
                    const item = getItem(week.id, resourceType);
                    const hasEvidence = Boolean(
                      item?.title.trim() || item?.url.trim(),
                    );

                    return (
                      <div
                        key={resourceType}
                        className="grid gap-3 p-4 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            {hasEvidence ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <span className="h-4 w-4 rounded-full border border-amber-400" />
                            )}
                            <p className="text-sm font-semibold text-foreground">
                              {teachingResourceLabel(resourceType)}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {hasEvidence ? "Material details added" : "Planned; details not added"}
                          </p>
                        </div>

                        <label className="space-y-1">
                          <span className="text-xs font-medium text-foreground">
                            Title / Description
                          </span>
                          <input
                            value={item?.title ?? ""}
                            onChange={(event) =>
                              updateSlot(week.id, resourceType, {
                                title: event.target.value,
                              })
                            }
                            placeholder={`e.g. Week ${week.week} ${teachingResourceLabel(resourceType)}`}
                            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs font-medium text-foreground">
                            Link
                          </span>
                          <div className="flex gap-2">
                            <input
                              type="url"
                              value={item?.url ?? ""}
                              onChange={(event) =>
                                updateSlot(week.id, resourceType, {
                                  url: event.target.value,
                                })
                              }
                              placeholder="https://..."
                              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                            />
                            {item?.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open ${teachingResourceLabel(resourceType)}`}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : null}
                          </div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      )}

      <div className="rounded-lg border border-blue-200/70 bg-blue-50/50 px-3 py-2 text-xs text-muted-foreground dark:border-blue-900/40 dark:bg-blue-950/20">
        Weekly Plan records what the lecturer intends to use. This section records the actual material or link. Missing material is an evidence gap for review, not a judgment about teaching quality.
      </div>
    </div>
  );
}
