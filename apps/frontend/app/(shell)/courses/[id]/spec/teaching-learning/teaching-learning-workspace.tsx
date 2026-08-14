"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Lightbulb,
  Loader2,
  Pencil,
  Save,
} from "lucide-react";
import {
  teachingLearningIsReady,
  type Method,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ChipMultiSelect } from "../clos/chip-multiselect";
import { withCodes, type CloForm } from "../clo-model";
import {
  teachingLearningApi,
  type TeachingLearningProfile,
} from "@/lib/teaching-learning";
import {
  ACTIVE_LEARNING_CLUSTERS,
  INDEPENDENT_LEARNING_OPTIONS,
  RESOURCE_TYPE_OPTIONS,
  TEACHING_PHILOSOPHY_OPTIONS,
  TECHNOLOGY_OPTIONS,
} from "./strategy-catalog";

export function TeachingLearningWorkspace({
  value,
  teachingMethods,
  onPersist,
  onProfileSaved,
}: {
  value: CloForm[];
  teachingMethods: Method[];
  onPersist: (items: CloForm[]) => Promise<boolean>;
  onProfileSaved?: (profile: TeachingLearningProfile) => void;
}) {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const clos = withCodes(value);

  const [savingCloId, setSavingCloId] = useState<string | null>(null);
  const [savedCloId, setSavedCloId] = useState<string | null>(null);
  const [editingCloId, setEditingCloId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [philosophyTags, setPhilosophyTags] = useState<string[]>([]);
  const [philosophyStatement, setPhilosophyStatement] = useState("");
  const [courseMethodIds, setCourseMethodIds] = useState<string[]>([]);
  const [strategyIds, setStrategyIds] = useState<string[]>([]);
  const [independentLearning, setIndependentLearning] = useState<string[]>([]);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [technologyTypes, setTechnologyTypes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const profile = await teachingLearningApi.get(courseId);
        if (cancelled) return;
        setPhilosophyTags(profile.philosophyTags);
        setPhilosophyStatement(profile.philosophyStatement);
        setCourseMethodIds(
          profile.teachingMethodIds.length > 0
            ? profile.teachingMethodIds
            : [...new Set(clos.flatMap((clo) => clo.teachingMethodIds))],
        );
        setStrategyIds(profile.activeLearningStrategyIds);
        setIndependentLearning(profile.independentLearningTypes);
        setResourceTypes(profile.resourceTypes);
        setTechnologyTypes(profile.technologyTypes);
      } catch {
        if (!cancelled) {
          setProfileError(
            "Could not load the saved Teaching & Learning profile.",
          );
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
    // CLO changes should not re-fetch and overwrite unsaved profile edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const activeClos = useMemo(
    () => clos.filter((clo) => clo.status === "active"),
    [clos],
  );
  const strategyOptions = useMemo(
    () =>
      ACTIVE_LEARNING_CLUSTERS.flatMap((cluster) => cluster.strategies).map(
        (strategy) => ({ id: strategy.id, name: strategy.label }),
      ),
    [],
  );
  const courseMethodIdSet = useMemo(
    () => new Set(courseMethodIds),
    [courseMethodIds],
  );
  const courseStrategyIdSet = useMemo(
    () => new Set(strategyIds),
    [strategyIds],
  );
  const courseMethodOptions = useMemo(
    () => teachingMethods.filter((method) => courseMethodIdSet.has(method.id)),
    [courseMethodIdSet, teachingMethods],
  );
  const courseStrategyOptions = useMemo(
    () =>
      strategyOptions.filter((strategy) =>
        courseStrategyIdSet.has(strategy.id),
      ),
    [courseStrategyIdSet, strategyOptions],
  );
  const coveredClos = useMemo(
    () =>
      activeClos.filter((clo) =>
        clo.teachingMethodIds.some((id) => courseMethodIdSet.has(id)),
      ).length,
    [activeClos, courseMethodIdSet],
  );

  const completion: [boolean, boolean, boolean, boolean, boolean] = [
    philosophyTags.length > 0 || philosophyStatement.trim().length > 0,
    courseMethodIds.length > 0,
    strategyIds.length > 0,
    independentLearning.length + resourceTypes.length + technologyTypes.length >
      0,
    activeClos.length > 0 && coveredClos === activeClos.length,
  ];
  const completeCount = completion.filter(Boolean).length;

  const toggle = (
    id: string,
    values: string[],
    setValues: (next: string[]) => void,
  ) =>
    setValues(
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );

  const updateCloSupport = async (
    cloId: string,
    patch: Pick<
      Partial<CloForm>,
      "teachingMethodIds" | "activeLearningStrategyIds"
    >,
  ) => {
    const next = clos.map((clo) =>
      clo.id === cloId ? { ...clo, ...patch } : clo,
    );
    setSavingCloId(cloId);
    setSavedCloId(null);
    try {
      if (await onPersist(next)) {
        setSavedCloId(cloId);
        window.setTimeout(
          () => setSavedCloId((id) => (id === cloId ? null : id)),
          1800,
        );
      }
    } finally {
      setSavingCloId(null);
    }
  };

  const saveProfile = async () => {
    const profile: TeachingLearningProfile = {
      philosophyTags,
      philosophyStatement: philosophyStatement.trim(),
      teachingMethodIds: courseMethodIds,
      activeLearningStrategyIds: strategyIds,
      independentLearningTypes: independentLearning,
      resourceTypes,
      technologyTypes,
    };

    setProfileSaving(true);
    setProfileSaved(false);
    setProfileError(null);
    try {
      const saved = await teachingLearningApi.save(courseId, profile);
      setPhilosophyTags(saved.philosophyTags);
      setPhilosophyStatement(saved.philosophyStatement);
      setCourseMethodIds(saved.teachingMethodIds);
      setStrategyIds(saved.activeLearningStrategyIds);
      setIndependentLearning(saved.independentLearningTypes);
      setResourceTypes(saved.resourceTypes);
      setTechnologyTypes(saved.technologyTypes);
      onProfileSaved?.(saved);
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 2500);
    } catch {
      setProfileError(
        "Teaching & Learning could not be saved. Please try again.",
      );
    } finally {
      setProfileSaving(false);
    }
  };

  if (clos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
        <p className="font-semibold">Define CLOs first</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Teaching &amp; Learning builds on the course learning outcomes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Teaching &amp; Learning</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Define the course-level philosophy and reusable teaching strategy.
              Weekly Plan remains the week-by-week execution workspace.
            </p>
          </div>
          <div className="sm:w-56">
            <div className="flex justify-between text-xs">
              <span>{completeCount} of 5 sections complete</span>
              <span>{completeCount * 20}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${completeCount * 20}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {profileLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading saved Teaching &amp; Learning settings…
        </div>
      ) : null}

      {profileError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {profileError}
        </div>
      ) : null}

      <Section
        number={1}
        title="Teaching Philosophy"
        prompt="How do you want students to learn in this course?"
        complete={completion[0]}
      >
        <div className="flex flex-wrap gap-2">
          {TEACHING_PHILOSOPHY_OPTIONS.map((option) => (
            <Chip
              key={option.id}
              selected={philosophyTags.includes(option.id)}
              onClick={() =>
                toggle(option.id, philosophyTags, setPhilosophyTags)
              }
            >
              {option.label}
            </Chip>
          ))}
        </div>
        <textarea
          rows={3}
          value={philosophyStatement}
          onChange={(event) => setPhilosophyStatement(event.target.value)}
          placeholder="Optional: describe the learning experience you want to create."
          className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/20"
        />
      </Section>

      <Section
        number={2}
        title="Teaching Methods"
        prompt="How will you normally teach this course?"
        complete={completion[1]}
      >
        <div
          id="teaching-learning-course-methods"
          className="flex flex-wrap gap-2"
        >
          {teachingMethods.map((method) => (
            <Chip
              key={method.id}
              selected={courseMethodIds.includes(method.id)}
              onClick={() =>
                toggle(method.id, courseMethodIds, setCourseMethodIds)
              }
            >
              {method.name}
            </Chip>
          ))}
        </div>
      </Section>

      <Section
        number={3}
        title="Active Learning Strategies"
        prompt="Choose how students will actively participate in learning."
        complete={completion[2]}
      >
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
          Clustered for quick selection so lecturers do not need to scan one
          long list.
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {ACTIVE_LEARNING_CLUSTERS.map((cluster) => (
            <div
              key={cluster.id}
              className="rounded-xl border border-border bg-muted/10 p-3.5"
            >
              <h4 className="text-sm font-semibold">{cluster.label}</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {cluster.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {cluster.strategies.slice(0, 3).map((strategy) => (
                  <Chip
                    compact
                    key={strategy.id}
                    selected={strategyIds.includes(strategy.id)}
                    onClick={() =>
                      toggle(strategy.id, strategyIds, setStrategyIds)
                    }
                  >
                    {strategy.label}
                  </Chip>
                ))}
              </div>
              {cluster.strategies.length > 3 ? (
                <button
                  type="button"
                  className="mt-3 text-xs font-medium text-primary"
                >
                  View more strategies
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section
        number={4}
        title="Independent Learning, Resources & Technology"
        prompt="Set course-level preferences. Actual files and links remain in Resources."
        complete={completion[3]}
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <Group
            title="Independent learning"
            options={[...INDEPENDENT_LEARNING_OPTIONS]}
            selected={independentLearning}
            onToggle={(value) =>
              toggle(value, independentLearning, setIndependentLearning)
            }
          />
          <Group
            title="Resource types"
            options={[...RESOURCE_TYPE_OPTIONS]}
            selected={resourceTypes}
            onToggle={(value) => toggle(value, resourceTypes, setResourceTypes)}
          />
          <Group
            title="Tools & technology"
            options={[...TECHNOLOGY_OPTIONS]}
            selected={technologyTypes}
            onToggle={(value) =>
              toggle(value, technologyTypes, setTechnologyTypes)
            }
          />
        </div>
      </Section>

      <Section
        number={5}
        title="CLO Coverage Check"
        prompt="Make sure every CLO has teaching support. Detailed alignment remains in Constructive Alignment."
        complete={completion[4]}
      >
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-muted/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {coveredClos} of {activeClos.length} active CLOs supported
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Each CLO can use only the methods and strategies selected above.
            </p>
          </div>
          {coveredClos < activeClos.length ? (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {activeClos.length - coveredClos} need attention
            </span>
          ) : (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CircleCheck className="h-3.5 w-3.5" />
              All supported
            </span>
          )}
        </div>
        <div className="space-y-2.5">
          {clos.map((clo) => {
            const selectedMethodIds = clo.teachingMethodIds.filter((id) =>
              courseMethodIdSet.has(id),
            );
            const selectedStrategyIds = clo.activeLearningStrategyIds.filter(
              (id) => courseStrategyIdSet.has(id),
            );
            const supported = selectedMethodIds.length > 0;
            const editing = editingCloId === clo.id;

            return (
              <div
                key={clo.id}
                className={`rounded-xl border bg-background transition-colors ${editing ? "border-primary/40" : "border-border"}`}
              >
                <div className="grid gap-3 p-3.5 lg:grid-cols-[minmax(240px,1.25fr)_minmax(180px,1fr)_minmax(180px,1fr)_140px] lg:items-center">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-bold">
                      {clo.code}
                    </span>
                    <p className="line-clamp-2 text-sm font-medium leading-5">
                      {clo.description}
                    </p>
                  </div>
                  <SelectionSummary
                    label="Teaching methods"
                    options={courseMethodOptions}
                    selectedIds={selectedMethodIds}
                    emptyText="None selected"
                  />
                  <SelectionSummary
                    label="Active learning"
                    options={courseStrategyOptions}
                    selectedIds={selectedStrategyIds}
                    emptyText="Optional"
                  />
                  <div className="flex items-center justify-between gap-2 lg:justify-end">
                    {savingCloId === clo.id ? (
                      <Status
                        icon={<Loader2 className="h-4 w-4 animate-spin" />}
                        text="Saving…"
                      />
                    ) : savedCloId === clo.id ? (
                      <Status
                        good
                        icon={<Check className="h-4 w-4" />}
                        text="Saved"
                      />
                    ) : clo.status === "inactive" ? (
                      <Status
                        good
                        icon={<CircleCheck className="h-4 w-4" />}
                        text="Inactive"
                      />
                    ) : supported ? (
                      <Status
                        good
                        icon={<CircleCheck className="h-4 w-4" />}
                        text="Supported"
                      />
                    ) : (
                      <Status
                        icon={<AlertTriangle className="h-4 w-4" />}
                        text="Needs attention"
                      />
                    )}
                    <button
                      type="button"
                      aria-expanded={editing}
                      aria-controls={`clo-support-${clo.id}`}
                      onClick={() => setEditingCloId(editing ? null : clo.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition hover:bg-muted/50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {editing ? "Close" : "Edit"}
                      {editing ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {editing ? (
                  <div
                    id={`clo-support-${clo.id}`}
                    className="border-t border-border bg-muted/10 p-4"
                  >
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        Choose a relevant subset of the course selections from
                        sections 2 and 3.
                      </p>
                      <a
                        href="#teaching-learning-course-methods"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Manage course selections above
                      </a>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <ChipMultiSelect
                        label={`Teaching methods for ${clo.code}`}
                        options={courseMethodOptions}
                        selectedIds={selectedMethodIds}
                        onChange={(ids) =>
                          void updateCloSupport(clo.id, {
                            teachingMethodIds: ids,
                          })
                        }
                        emptyMessage="Select course teaching methods in section 2 first."
                      />
                      <ChipMultiSelect
                        label={`Active learning for ${clo.code}`}
                        options={courseStrategyOptions}
                        selectedIds={selectedStrategyIds}
                        onChange={(ids) =>
                          void updateCloSupport(clo.id, {
                            activeLearningStrategyIds: ids,
                          })
                        }
                        emptyMessage="Select course active-learning strategies in section 3 first."
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-semibold">How this supports Weekly Plan</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Teaching &amp; Learning defines the course-level approach. Assessment
          defines how learning is measured. Weekly Plan will use both as
          contextual suggestions while the lecturer decides what actually
          happens each week.
        </p>
      </div>

      <div className="sticky bottom-3 flex items-center justify-end gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
        {!teachingLearningIsReady(
          {
            philosophyTags,
            philosophyStatement,
            teachingMethodIds: courseMethodIds,
            activeLearningStrategyIds: strategyIds,
            independentLearningTypes: independentLearning,
            resourceTypes,
            technologyTypes,
          },
          clos,
        ) ? (
          <span className="mr-auto text-xs text-amber-600 dark:text-amber-400">
            Complete philosophy, methods, active learning, and teaching support for every active CLO.
          </span>
        ) : null}
        {profileSaved ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="h-4 w-4" /> Saved to database
          </span>
        ) : null}
        <Button
          onClick={() => void saveProfile()}
          disabled={profileLoading || profileSaving}
        >
          {profileSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Teaching &amp; Learning
        </Button>
      </div>
    </div>
  );
}

function Section({
  number,
  title,
  prompt,
  complete,
  children,
}: {
  number: number;
  title: string;
  prompt: string;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {number}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold">{title}</h3>
            {complete ? (
              <CircleCheck className="h-4 w-4 text-emerald-500" />
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{prompt}</p>
        </div>
      </div>
      <div className="sm:pl-11">{children}</div>
    </section>
  );
}

function Chip({
  selected,
  compact = false,
  onClick,
  children,
}: {
  selected: boolean;
  compact?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border font-medium transition ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} ${selected ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted/40"}`}
    >
      {selected ? <Check className="h-3 w-3" /> : null}
      {children}
    </button>
  );
}

function Group({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Chip
            compact
            key={option}
            selected={selected.includes(option)}
            onClick={() => onToggle(option)}
          >
            {option}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function SelectionSummary({
  label,
  options,
  selectedIds,
  emptyText,
}: {
  label: string;
  options: Method[];
  selectedIds: string[];
  emptyText: string;
}) {
  const selected = selectedIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is Method => Boolean(option));
  const visible = selected.slice(0, 2);
  const remaining = selected.length - visible.length;

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {selected.length > 0 ? (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
          {visible.map((option) => (
            <span
              key={option.id}
              className="max-w-36 truncate rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              title={option.name}
            >
              {option.name}
            </span>
          ))}
          {remaining > 0 ? (
            <span className="text-xs font-medium text-muted-foreground">
              +{remaining} more
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

function Status({
  good = false,
  icon,
  text,
}: {
  good?: boolean;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${good ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
    >
      {icon}
      {text}
    </span>
  );
}
