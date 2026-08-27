"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  CreateRubricInput,
  DEFAULT_RUBRIC_LEVELS,
  RUBRIC_STATUSES,
  RUBRIC_TYPES,
  rubricMaxLevelPoints,
  type RubricCriterion,
  type RubricLevel,
  type RubricStatus,
  type RubricType,
} from "@dse-pms/shared-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  FormFieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dse-pms/ui";
import { Topbar } from "../../../../../topbar";
import { ApiError } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { rubricsApi } from "@/lib/rubrics";

function newCriterion(levelCount: number): RubricCriterion {
  return {
    id: crypto.randomUUID(),
    name: "",
    descriptors: Array.from({ length: levelCount }, () => ""),
  };
}

export function RubricFormPage({
  courseId,
  rubricId,
}: {
  courseId: string;
  rubricId: string | null;
}) {
  const router = useRouter();
  const editing = rubricId !== null;

  const [course, setCourse] = useState<CourseView | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<RubricType>(RUBRIC_TYPES[0]);
  const [status, setStatus] = useState<RubricStatus>("Draft");
  const [description, setDescription] = useState("");
  const [levels, setLevels] = useState<RubricLevel[]>(() => DEFAULT_RUBRIC_LEVELS.map((l) => ({ ...l })));
  const [criteria, setCriteria] = useState<RubricCriterion[]>(() => [newCriterion(DEFAULT_RUBRIC_LEVELS.length)]);

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const backHref = `/courses/${courseId}/spec/assessment/rubrics`;
  const assessmentHref = `/courses/${courseId}/spec?tab=assessmentPlan`;

  useEffect(() => {
    coursesApi.get(courseId).then(setCourse).catch(() => setCourse(null));
  }, [courseId]);

  useEffect(() => {
    if (!rubricId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await rubricsApi.get(rubricId);
        if (cancelled) return;
        setName(r.name);
        setType(r.type);
        setStatus(r.status);
        setDescription(r.description);
        setLevels(r.levels.map((l) => ({ ...l })));
        setCriteria(r.criteria.length > 0 ? r.criteria.map((c) => ({ ...c })) : [newCriterion(r.levels.length)]);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load the rubric");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rubricId]);

  const maxPoints = useMemo(() => rubricMaxLevelPoints(levels), [levels]);
  const totalPoints = criteria.length * maxPoints;

  // --- Level (column) editing ---
  const updateLevel = (i: number, patch: Partial<RubricLevel>) =>
    setLevels((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addLevel = () => {
    setLevels((ls) => [...ls, { label: "New level", points: 0 }]);
    setCriteria((cs) => cs.map((c) => ({ ...c, descriptors: [...c.descriptors, ""] })));
  };

  const removeLevel = (i: number) => {
    if (levels.length <= 1) return;
    setLevels((ls) => ls.filter((_, idx) => idx !== i));
    setCriteria((cs) => cs.map((c) => ({ ...c, descriptors: c.descriptors.filter((_, idx) => idx !== i) })));
  };

  // --- Criterion (row) editing ---
  const updateCriterion = (id: string, patch: Partial<RubricCriterion>) =>
    setCriteria((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const updateDescriptor = (id: string, li: number, value: string) =>
    setCriteria((cs) =>
      cs.map((c) =>
        c.id === id ? { ...c, descriptors: c.descriptors.map((d, idx) => (idx === li ? value : d)) } : c,
      ),
    );

  const addCriterion = () => setCriteria((cs) => [...cs, newCriterion(levels.length)]);
  const removeCriterion = (id: string) =>
    setCriteria((cs) => (cs.length <= 1 ? cs : cs.filter((c) => c.id !== id)));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = {
      name,
      type,
      description,
      status,
      levels,
      criteria: criteria.map((c) => ({ ...c, name: c.name.trim() })),
    };
    const parsed = CreateRubricInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
      return;
    }
    setSaving(true);
    try {
      if (rubricId) await rubricsApi.update(rubricId, parsed.data);
      else await rubricsApi.create(parsed.data);
      router.push(backHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the rubric");
    } finally {
      setSaving(false);
    }
  };

  const breadcrumbLabel = course ? `${course.code} – ${course.title}` : "Course Specification";
  const pageTitle = editing ? "Edit rubric" : "Create rubric";

  return (
    <>
      <Topbar title={pageTitle} subtitle="Define criteria and a rating scale for a reusable assessment rubric." />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/courses">Course Management</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={assessmentHref}>Course Specification</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={assessmentHref}>Assessment</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={backHref}>Rubric Library</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {error ? (
            <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : notFound ? (
            <p className="text-sm text-muted-foreground">
              That rubric could not be found.{" "}
              <Link href={backHref} className="underline">
                Back to Rubric Library
              </Link>
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              {/* Details */}
              <section className="space-y-4 rounded-xl border border-border bg-card p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5 sm:col-span-2">
                    <FormFieldLabel required>Rubric name</FormFieldLabel>
                    <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Assignment Rubric – Written Report" />
                  </label>
                  <label className="block space-y-1.5">
                    <FormFieldLabel required>Type</FormFieldLabel>
                    <Select value={type} onValueChange={(v) => setType(v as RubricType)}>
                      <SelectTrigger aria-required="true">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RUBRIC_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block space-y-1.5">
                    <FormFieldLabel required>Status</FormFieldLabel>
                    <Select value={status} onValueChange={(v) => setStatus(v as RubricStatus)}>
                      <SelectTrigger aria-required="true">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RUBRIC_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block space-y-1.5 sm:col-span-2">
                    <FormFieldLabel>Description</FormFieldLabel>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="What this rubric evaluates…"
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    />
                  </label>
                </div>
              </section>

              {/* Rating scale */}
              <section className="space-y-3 rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Rating scale</h2>
                    <p className="text-xs text-muted-foreground">
                      The columns of the grid. Each criterion is scored out of the top value ({maxPoints}).
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addLevel}>
                    <Plus className="h-4 w-4" />
                    Add level
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {levels.map((lvl, i) => (
                    <div key={i} className="flex items-end gap-2 rounded-lg border border-border p-3">
                      <label className="space-y-1">
                        <FormFieldLabel required className="text-xs">Label</FormFieldLabel>
                        <Input
                          required
                          value={lvl.label}
                          onChange={(e) => updateLevel(i, { label: e.target.value })}
                          className="h-8 w-32"
                        />
                      </label>
                      <label className="space-y-1">
                        <FormFieldLabel required className="text-xs">Points</FormFieldLabel>
                        <Input
                          required
                          type="number"
                          min={0}
                          value={lvl.points}
                          onChange={(e) => updateLevel(i, { points: Number(e.target.value) })}
                          className="h-8 w-20"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeLevel(i)}
                        disabled={levels.length <= 1}
                        aria-label="Remove level"
                        className="mb-1 rounded-md p-1.5 text-muted-foreground hover:bg-status-live-bg hover:text-status-live disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Criteria grid */}
              <section className="space-y-3 rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Criteria</h2>
                    <p className="text-xs text-muted-foreground">
                      {criteria.length} criteria · total {totalPoints} points
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addCriterion}>
                    <Plus className="h-4 w-4" />
                    Add criterion
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                        <th className="w-48 px-3 py-2">
                          <FormFieldLabel required className="text-xs">Criterion</FormFieldLabel>
                        </th>
                        {levels.map((lvl, i) => (
                          <th key={i} className="px-3 py-2 text-center">
                            <div className="font-semibold text-foreground">{lvl.points}</div>
                            <div>{lvl.label}</div>
                          </th>
                        ))}
                        <th className="w-10 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {criteria.map((c) => (
                        <tr key={c.id} className="border-t border-border align-top">
                          <td className="px-3 py-2">
                            <Input
                              required
                              aria-label="Criterion name"
                              value={c.name}
                              onChange={(e) => updateCriterion(c.id, { name: e.target.value })}
                              placeholder="e.g. Content Quality"
                              className="h-8"
                            />
                          </td>
                          {levels.map((_lvl, li) => (
                            <td key={li} className="px-2 py-2">
                              <textarea
                                value={c.descriptors[li] ?? ""}
                                onChange={(e) => updateDescriptor(c.id, li, e.target.value)}
                                rows={2}
                                placeholder="Descriptor…"
                                className="w-full min-w-[120px] rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeCriterion(c.id)}
                              disabled={criteria.length <= 1}
                              aria-label="Remove criterion"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-status-live-bg hover:text-status-live disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" render={<Link href={backHref}>Cancel</Link>} />
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create rubric"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
