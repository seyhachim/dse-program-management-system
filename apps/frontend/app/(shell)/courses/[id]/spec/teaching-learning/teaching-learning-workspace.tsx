"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CircleCheck,
  Lightbulb,
  Loader2,
  Save,
} from "lucide-react";
import {
  teachingLearningIsReady,
  type ActiveLearningCluster,
  type Method,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ChipMultiSelect } from "../clos/chip-multiselect";
import { withCodes, type CloForm } from "../clo-model";
import { methodsApi } from "@/lib/methods";
import {
  teachingLearningApi,
  type TeachingLearningProfile,
} from "@/lib/teaching-learning";
import {
  ACTIVE_LEARNING_CLUSTERS,
  INDEPENDENT_LEARNING_OPTIONS,
  REQUIRED_DELIVERY_RESOURCE_OPTIONS,
  TEACHING_LEARNING_MATERIAL_OPTIONS,
  TEACHING_PHILOSOPHY_OPTIONS,
} from "./strategy-catalog";

const FALLBACK_ACTIVE_LEARNING_CLUSTERS: ActiveLearningCluster[] =
  ACTIVE_LEARNING_CLUSTERS.map((cluster, clusterIndex) => ({
    id: cluster.id,
    name: cluster.label,
    description: cluster.description,
    sortOrder: (clusterIndex + 1) * 10,
    active: true,
    strategies: cluster.strategies.map((strategy, strategyIndex) => ({
      id: strategy.id,
      name: strategy.label,
      clusterId: cluster.id,
      sortOrder: (strategyIndex + 1) * 10,
      active: true,
    })),
  }));

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
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [philosophyTags, setPhilosophyTags] = useState<string[]>([]);
  const [philosophyStatement, setPhilosophyStatement] = useState("");
  const [courseMethodIds, setCourseMethodIds] = useState<string[]>([]);
  const [strategyIds, setStrategyIds] = useState<string[]>([]);
  const [activeLearningClusters, setActiveLearningClusters] = useState<
    ActiveLearningCluster[]
  >(FALLBACK_ACTIVE_LEARNING_CLUSTERS);
  const [independentLearning, setIndependentLearning] = useState<string[]>([]);
  const [teachingLearningMaterials, setTeachingLearningMaterials] = useState<string[]>([]);
  const [requiredDeliveryResources, setRequiredDeliveryResources] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const [profile, vocabulary] = await Promise.all([
          teachingLearningApi.get(courseId),
          methodsApi.list(),
        ]);
        if (cancelled) return;
        setPhilosophyTags(profile.philosophyTags);
        setPhilosophyStatement(profile.philosophyStatement);
        setCourseMethodIds(
          profile.teachingMethodIds.length > 0
            ? profile.teachingMethodIds
            : [...new Set(clos.flatMap((clo) => clo.teachingMethodIds))],
        );
        setStrategyIds(profile.activeLearningStrategyIds);
        setActiveLearningClusters(vocabulary.activeLearningClusters);
        setIndependentLearning(profile.independentLearningTypes);
        setTeachingLearningMaterials(profile.resourceTypes);
        setRequiredDeliveryResources(profile.technologyTypes);
      } catch {
        if (!cancelled) {
          setProfileError(
            "Could not load all saved Teaching & Learning settings. The default active-learning catalogue is shown as a fallback.",
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

  const coveredClos = useMemo(
    () =>
      clos.filter(
        (clo) => clo.status === "active" && clo.teachingMethodIds.length > 0,
      ).length,
    [clos],
  );
  const activeClos = useMemo(
    () => clos.filter((clo) => clo.status === "active"),
    [clos],
  );
  const strategyOptions = useMemo(
    () =>
      activeLearningClusters.flatMap((cluster) => cluster.strategies).map(
        (strategy) => ({ id: strategy.id, name: strategy.name }),
      ),
    [activeLearningClusters],
  );

  const completion: [boolean, boolean, boolean, boolean, boolean] = [
    philosophyTags.length > 0 || philosophyStatement.trim().length > 0,
    courseMethodIds.length > 0,
    strategyIds.length > 0,
    independentLearning.length +
        teachingLearningMaterials.length +
        requiredDeliveryResources.length >
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
      resourceTypes: teachingLearningMaterials,
      technologyTypes: requiredDeliveryResources,
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
      setTeachingLearningMaterials(saved.resourceTypes);
      setRequiredDeliveryResources(saved.technologyTypes);
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
              Define the course-level philosophy, teaching strategy, delivery
              requirements, and learning materials. Weekly Plan remains the
              week-by-week execution workspace.
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
        <div className="flex flex-wrap gap-2">
          {teachingMethods.filter((method) => method.active).map((method) => (
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
          Programme-managed clusters keep selection quick and consistent across courses.
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {activeLearningClusters.map((cluster) => (
            <div
              key={cluster.id}
              className="rounded-xl border border-border bg-muted/10 p-3.5"
            >
              <h4 className="text-sm font-semibold">{cluster.name}</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {cluster.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {cluster.strategies.map((strategy) => (
                  <Chip
                    compact
                    key={strategy.id}
                    selected={strategyIds.includes(strategy.id)}
                    onClick={() =>
                      toggle(strategy.id, strategyIds, setStrategyIds)
                    }
                  >
                    {strategy.name}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        number={4}
        title="Course-Level Learning Support"
        prompt="Define what the institution must provide and what materials support learning across the course."
        complete={completion[3]}
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <Group
            title="Independent Learning"
            description="How students continue learning outside scheduled contact time."
            options={[...INDEPENDENT_LEARNING_OPTIONS]}
            selected={independentLearning}
            onToggle={(value) =>
              toggle(value, independentLearning, setIndependentLearning)
            }
          />
          <Group
            title="Required Delivery Resources (§19)"
            description="Facilities, infrastructure, software, platforms, or equipment required to run the course."
            options={[...REQUIRED_DELIVERY_RESOURCE_OPTIONS]}
            selected={requiredDeliveryResources}
            onToggle={(value) =>
              toggle(
                value,
                requiredDeliveryResources,
                setRequiredDeliveryResources,
              )
            }
          />
          <Group
            title="Teaching & Learning Materials (§20)"
            description="Instructional materials used by the lecturer or students to support learning."
            options={[...TEACHING_LEARNING_MATERIAL_OPTIONS]}
            selected={teachingLearningMaterials}
            onToggle={(value) =>
              toggle(
                value,
                teachingLearningMaterials,
                setTeachingLearningMaterials,
              )
            }
          />
        </div>
        <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <strong className="text-foreground">§19</strong> is what the
          university/department must provide to deliver the course.{" "}
          <strong className="text-foreground">§20</strong> is what the lecturer
          prepares or selects for teaching and student learning. Files, URLs, and
          references can still be managed in the Resources tab.
        </div>
      </Section>

      <Section
        number={5}
        title="CLO Coverage Check"
        prompt="Make sure every CLO has teaching support. Detailed alignment remains in Constructive Alignment."
        complete={completion[4]}
      >
        <div className="space-y-2.5">
          {clos.map((clo) => (
            <div
              key={clo.id}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1fr)_minmax(300px,1fr)_140px] xl:items-start">
                <div className="flex items-start gap-2.5">
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold">
                    {clo.code}
                  </span>
                  <p className="text-sm font-medium">{clo.description}</p>
                </div>
                <ChipMultiSelect
                  label={`Teaching methods for ${clo.code}`}
                  options={teachingMethods.filter((method) => method.active)}
                  selectedIds={clo.teachingMethodIds}
                  onChange={(ids) =>
                    void updateCloSupport(clo.id, { teachingMethodIds: ids })
                  }
                  emptyMessage="No teaching methods defined yet."
                />
                <ChipMultiSelect
                  label={`Active learning for ${clo.code}`}
                  options={strategyOptions}
                  selectedIds={clo.activeLearningStrategyIds}
                  onChange={(ids) =>
                    void updateCloSupport(clo.id, {
                      activeLearningStrategyIds: ids,
                    })
                  }
                  emptyMessage="No active-learning strategies defined yet."
                />
                <div className="flex justify-end">
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
                  ) : clo.teachingMethodIds.length ? (
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
                </div>
              </div>
            </div>
          ))}
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
            resourceTypes: teachingLearningMaterials,
            technologyTypes: requiredDeliveryResources,
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
  description,
  options,
  selected,
  onToggle,
}: {
  title: string;
  description?: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
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
