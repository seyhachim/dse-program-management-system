"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@dse-pms/ui";
import {
  REFERENCE_KINDS,
  referenceKindLabel,
  type ReferenceKind,
} from "@dse-pms/shared-types";
import type { WeeklyPlanForm } from "./weekly-plan-model";
import {
  referenceYearError,
  type ReferencesForm,
} from "./references-model";
import {
  resourcesForWeek,
  unresolvedResourceWeekIds,
  type ResourcesForm,
} from "./resources-model";

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary";

export function LearningResourcesSection({
  references,
  resources,
  weeklyPlan,
  onPersistReferences,
  onPersistResources,
  onGoToWeeklyPlan,
}: {
  references: ReferencesForm;
  resources: ResourcesForm;
  weeklyPlan: WeeklyPlanForm;
  onPersistReferences: (items: ReferencesForm) => Promise<boolean>;
  onPersistResources: (items: ResourcesForm) => Promise<boolean>;
  onGoToWeeklyPlan: () => void;
}) {
  const [referenceDraft, setReferenceDraft] = useState<ReferencesForm>(references);
  const [resourceDraft, setResourceDraft] = useState<ResourcesForm>(resources);
  const [expandedReferences, setExpandedReferences] = useState<Set<string>>(
    new Set(),
  );
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("Saved");

  const currentYear = new Date().getFullYear();
  const referenceErrors = useMemo(
    () =>
      referenceDraft.flatMap((item) => {
        const errors: string[] = [];
        if (!item.title.trim()) errors.push("Title is required.");
        const yearError = referenceYearError(item.year, currentYear);
        if (yearError) errors.push(yearError);
        return errors.length > 0 ? [{ id: item.id, errors }] : [];
      }),
    [currentYear, referenceDraft],
  );
  const referenceErrorsById = useMemo(
    () => new Map(referenceErrors.map((entry) => [entry.id, entry.errors])),
    [referenceErrors],
  );
  const unresolvedWeekIds = useMemo(
    () => unresolvedResourceWeekIds(resourceDraft, weeklyPlan),
    [resourceDraft, weeklyPlan],
  );
  const unassignedResources = useMemo(
    () => resourceDraft.filter((item) => item.evidenceWeekIds.length === 0),
    [resourceDraft],
  );

  const markDirty = () => {
    setDirty(true);
    setSaveMessage("Unsaved changes");
  };

  const updateReference = (
    id: string,
    patch: Partial<ReferencesForm[number]>,
  ) => {
    setReferenceDraft((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    markDirty();
  };

  const addReference = () => {
    const id = crypto.randomUUID();
    setReferenceDraft((current) => [
      ...current,
      {
        id,
        kind: "REQUIRED",
        title: "",
        authors: "",
        publisher: "",
        year: String(currentYear),
        edition: "",
        isbn: "",
        url: "",
        basedOn: "",
        notes: "",
      },
    ]);
    setExpandedReferences((current) => new Set(current).add(id));
    markDirty();
  };

  const removeReference = (id: string) => {
    setReferenceDraft((current) => current.filter((item) => item.id !== id));
    setExpandedReferences((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    markDirty();
  };

  const updateResource = (
    id: string,
    patch: Partial<ResourcesForm[number]>,
  ) => {
    setResourceDraft((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    markDirty();
  };

  const addResource = (weekId: string) => {
    setResourceDraft((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        resourceType: "",
        title: "",
        url: "",
        notes: "",
        evidenceWeekIds: [weekId],
      },
    ]);
    markDirty();
  };

  const assignResourceToWeek = (resourceId: string, weekId: string) => {
    setResourceDraft((current) =>
      current.map((item) =>
        item.id === resourceId
          ? {
              ...item,
              evidenceWeekIds: item.evidenceWeekIds.includes(weekId)
                ? item.evidenceWeekIds
                : [...item.evidenceWeekIds, weekId],
            }
          : item,
      ),
    );
    setExpandedWeeks((current) => new Set(current).add(weekId));
    markDirty();
  };

  const removeResourceFromWeek = (resourceId: string, weekId: string) => {
    setResourceDraft((current) =>
      current.flatMap((item) => {
        if (item.id !== resourceId) return [item];
        const remaining = item.evidenceWeekIds.filter((id) => id !== weekId);
        return remaining.length > 0
          ? [{ ...item, evidenceWeekIds: remaining }]
          : [];
      }),
    );
    markDirty();
  };

  const toggleReference = (id: string) => {
    setExpandedReferences((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleWeek = (id: string) => {
    setExpandedWeeks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!dirty || saving || referenceErrors.length > 0) return;
    setSaving(true);
    setSaveMessage("Saving…");
    try {
      const referencesOk = await onPersistReferences(referenceDraft);
      if (!referencesOk) {
        setSaveMessage("Save failed — changes are still unsaved");
        return;
      }
      const resourcesOk = await onPersistResources(resourceDraft);
      if (!resourcesOk) {
        setSaveMessage("Resources failed to save — changes are still unsaved");
        return;
      }
      setDirty(false);
      setSaveMessage("Saved ✓");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Learning Resources</h2>
          <p className="text-sm text-muted-foreground">
            Manage academic references first, then the practical resources used
            in each Weekly Plan entry.
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <span
            aria-live="polite"
            className={`w-full break-words text-sm sm:w-auto sm:max-w-sm sm:text-right ${dirty ? "text-amber-600" : "text-emerald-600"}`}
          >
            {saveMessage}
          </span>
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={save}
            disabled={!dirty || saving || referenceErrors.length > 0}
          >
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Saving…" : "Save Resources"}
          </Button>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <BookOpen className="h-4 w-4" /> References &amp; Textbooks
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              References must have a publication year less than 10 years old.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={addReference}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Reference
          </Button>
        </div>

        {referenceDraft.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No references recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {referenceDraft.map((item) => {
              const expanded = expandedReferences.has(item.id);
              const errors = referenceErrorsById.get(item.id) ?? [];
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-background"
                >
                  <div className="flex items-start gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => toggleReference(item.id)}
                      className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label={
                        expanded ? "Collapse reference" : "Expand reference"
                      }
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleReference(item.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                          {referenceKindLabel(item.kind)}
                        </span>
                        {errors.length > 0 ? (
                          <span className="text-xs text-destructive">
                            Needs attention
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-foreground">
                        {item.title || "Untitled reference"}
                      </p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {[item.authors, item.year, item.edition]
                          .filter(Boolean)
                          .join(" · ") || "Add publication details"}
                      </p>
                    </button>
                  </div>

                  {expanded ? (
                    <div className="border-t border-border p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Kind">
                          <select
                            value={item.kind}
                            onChange={(event) =>
                              updateReference(item.id, {
                                kind: event.target.value as ReferenceKind,
                              })
                            }
                            className={INPUT_CLASS}
                          >
                            {REFERENCE_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {referenceKindLabel(kind)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Title">
                          <input
                            value={item.title}
                            onChange={(event) =>
                              updateReference(item.id, {
                                title: event.target.value,
                              })
                            }
                            className={INPUT_CLASS}
                          />
                        </Field>
                        <Field label="Authors">
                          <input
                            value={item.authors}
                            onChange={(event) =>
                              updateReference(item.id, {
                                authors: event.target.value,
                              })
                            }
                            className={INPUT_CLASS}
                          />
                        </Field>
                        <Field label="Publisher">
                          <input
                            value={item.publisher}
                            onChange={(event) =>
                              updateReference(item.id, {
                                publisher: event.target.value,
                              })
                            }
                            className={INPUT_CLASS}
                          />
                        </Field>
                        <Field label="Publication Year">
                          <input
                            type="number"
                            min={currentYear - 9}
                            max={currentYear}
                            value={item.year}
                            onChange={(event) =>
                              updateReference(item.id, {
                                year: event.target.value,
                              })
                            }
                            className={INPUT_CLASS}
                          />
                        </Field>
                        <Field label="Edition (optional)">
                          <input
                            value={item.edition ?? ""}
                            onChange={(event) =>
                              updateReference(item.id, {
                                edition: event.target.value,
                              })
                            }
                            placeholder="e.g. 2nd Edition"
                            className={INPUT_CLASS}
                          />
                        </Field>
                        <Field label="ISBN">
                          <input
                            value={item.isbn}
                            onChange={(event) =>
                              updateReference(item.id, {
                                isbn: event.target.value,
                              })
                            }
                            className={INPUT_CLASS}
                          />
                        </Field>
                        <Field label="Link (optional)">
                          <LinkInput
                            value={item.url}
                            onChange={(url) =>
                              updateReference(item.id, { url })
                            }
                          />
                        </Field>
                        <div className="sm:col-span-2">
                          <Field label="Based On (edition chapters, scope, etc.)">
                            <input
                              value={item.basedOn}
                              onChange={(event) =>
                                updateReference(item.id, {
                                  basedOn: event.target.value,
                                })
                              }
                              className={INPUT_CLASS}
                            />
                          </Field>
                        </div>
                        <div className="sm:col-span-2">
                          <Field label="Notes">
                            <textarea
                              value={item.notes}
                              onChange={(event) =>
                                updateReference(item.id, {
                                  notes: event.target.value,
                                })
                              }
                              className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </Field>
                        </div>
                      </div>
                      {errors.length > 0 ? (
                        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                          {errors.map((message) => (
                            <p key={message}>{message}</p>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full text-destructive hover:text-destructive sm:w-auto"
                          onClick={() => removeReference(item.id)}
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" /> Remove Reference
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Link2 className="h-4 w-4" /> Resources Used in Class
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Week boxes come from the Weekly Plan. Resource links use stable week
            IDs so reordering does not lose provenance.
          </p>
        </div>

        {unresolvedWeekIds.length > 0 ? (
          <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <strong>
              Resources from removed Weekly Plan entries need review.
            </strong>{" "}
            Preserved week IDs: {unresolvedWeekIds.join(", ")}.
          </div>
        ) : null}

        {unassignedResources.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div>
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Existing resources need a week assignment
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                These legacy resources are preserved. Assign them intentionally;
                the redesign will not guess a week or delete them.
              </p>
            </div>
            {unassignedResources.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-amber-300/70 bg-background p-2.5"
              >
                <p className="text-sm font-medium text-foreground">
                  {item.title || item.resourceType || "Untitled resource"}
                </p>
                {weeklyPlan.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {weeklyPlan.map((week) => (
                      <Button
                        key={week.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => assignResourceToWeek(item.id, week.id)}
                      >
                        Assign to Week {week.week || "—"}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {weeklyPlan.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              No weekly plan yet
            </p>
            <p className="mx-auto mt-1 max-w-xl text-xs text-muted-foreground">
              Create the Weekly Plan first. Week-based resource boxes will
              appear here automatically.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={onGoToWeeklyPlan}
            >
              Go to Weekly Plan
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {weeklyPlan.map((week) => {
              const expanded = expandedWeeks.has(week.id);
              const weekResources = resourcesForWeek(resourceDraft, week.id);
              return (
                <div
                  key={week.id}
                  className="rounded-lg border border-border bg-background"
                >
                  <button
                    type="button"
                    onClick={() => toggleWeek(week.id)}
                    className="flex w-full items-start gap-3 p-3 text-left"
                  >
                    {expanded ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-foreground">
                        Week {week.week || "—"} — {week.topic || "Untitled week"}
                      </p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {week.cloCodes.length > 0
                          ? week.cloCodes.join(", ")
                          : "No CLO linked"}{" "}
                        ·{" "}
                        {weekResources.length === 0
                          ? "No resources yet"
                          : `${weekResources.length} resource${weekResources.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="space-y-3 border-t border-border p-4">
                      {weekResources.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border bg-muted/10 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground">
                              Class resource
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                removeResourceFromWeek(item.id, week.id)
                              }
                              aria-label="Remove resource from this week"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            <Field label="Resource Type">
                              <input
                                value={item.resourceType}
                                onChange={(event) =>
                                  updateResource(item.id, {
                                    resourceType: event.target.value,
                                  })
                                }
                                placeholder="e.g. Dataset, Software, Notebook"
                                className={INPUT_CLASS}
                              />
                            </Field>
                            <Field label="Resource Name / Description">
                              <input
                                value={item.title}
                                onChange={(event) =>
                                  updateResource(item.id, {
                                    title: event.target.value,
                                  })
                                }
                                className={INPUT_CLASS}
                              />
                            </Field>
                            <div className="sm:col-span-2">
                              <Field label="Link (optional)">
                                <LinkInput
                                  value={item.url}
                                  onChange={(url) =>
                                    updateResource(item.id, { url })
                                  }
                                />
                              </Field>
                            </div>
                            <div className="sm:col-span-2">
                              <Field label="Notes">
                                <textarea
                                  value={item.notes}
                                  onChange={(event) =>
                                    updateResource(item.id, {
                                      notes: event.target.value,
                                    })
                                  }
                                  className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                                />
                              </Field>
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => addResource(week.id)}
                      >
                        <Plus className="mr-1.5 h-4 w-4" /> Add Resource to Week{" "}
                        {week.week || ""}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function LinkInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://..."
        className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      />
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          aria-label="Open link"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}
