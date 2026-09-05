"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import {
  teachingLearningIsReady,
  type Method,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import {
  teachingLearningApi,
  type TeachingLearningProfile,
} from "@/lib/teaching-learning";
import {
  CourseSpecAuthoringHeader,
  CourseSpecAuthoringStack,
  CourseSpecEmptyState,
  CourseSpecNotice,
} from "./authoring-section-ui";
import { ChipMultiSelect } from "./clos/chip-multiselect";
import { withCodes, type CloForm } from "./clo-model";
import {
  INDEPENDENT_LEARNING_OPTIONS,
  REQUIRED_DELIVERY_RESOURCE_OPTIONS,
  TEACHING_LEARNING_MATERIAL_OPTIONS,
  TEACHING_PHILOSOPHY_OPTIONS,
} from "./teaching-learning/strategy-catalog";

const PROJECT_BASED_LEARNING_ID = "project-based-learning";
const PROJECT_WORK = "Project Work";

type ChoiceOption = string | { id: string; label: string };

function toggleValue(value: string, values: string[]): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function ensureProjectWork(values: string[]): string[] {
  return values.includes(PROJECT_WORK) ? values : [...values, PROJECT_WORK];
}

function ChoiceChips({
  label,
  description,
  options,
  values,
  onChange,
}: {
  label: string;
  description: string;
  options: readonly ChoiceOption[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((rawOption) => {
          const option =
            typeof rawOption === "string"
              ? { id: rawOption, label: rawOption }
              : rawOption;
          const selected = values.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(toggleValue(option.id, values))}
              className={[
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FinalProjectSupervisionSection({
  courseId,
  value,
  teachingMethods,
  profile,
  onPersist,
  onProfileSaved,
}: {
  courseId: string;
  value: CloForm[];
  teachingMethods: Method[];
  profile: TeachingLearningProfile;
  onPersist: (items: CloForm[]) => Promise<boolean>;
  onProfileSaved: (profile: TeachingLearningProfile) => void;
}) {
  const clos = withCodes(value);
  const [philosophyTags, setPhilosophyTags] = useState(profile.philosophyTags);
  const [philosophyStatement, setPhilosophyStatement] = useState(
    profile.philosophyStatement,
  );
  const [methodIds, setMethodIds] = useState(profile.teachingMethodIds);
  const [independentLearning, setIndependentLearning] = useState(
    ensureProjectWork(profile.independentLearningTypes),
  );
  const [materials, setMaterials] = useState(profile.resourceTypes);
  const [resources, setResources] = useState(profile.technologyTypes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCloId, setSavingCloId] = useState<string | null>(null);

  const activeClos = useMemo(
    () => clos.filter((clo) => clo.status === "active"),
    [clos],
  );
  const coveredClos = useMemo(
    () => activeClos.filter((clo) => clo.teachingMethodIds.length > 0).length,
    [activeClos],
  );
  const projectIndependentLearning = ensureProjectWork(independentLearning);

  const currentProfile: TeachingLearningProfile = {
    philosophyTags,
    philosophyStatement: philosophyStatement.trim(),
    teachingMethodIds: methodIds,
    activeLearningStrategyIds: [
      ...new Set([
        ...profile.activeLearningStrategyIds,
        PROJECT_BASED_LEARNING_ID,
      ]),
    ],
    independentLearningTypes: projectIndependentLearning,
    resourceTypes: materials,
    technologyTypes: resources,
  };
  const ready = teachingLearningIsReady(currentProfile, clos);

  const saveProfile = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const next = await teachingLearningApi.save(courseId, currentProfile);
      setIndependentLearning(ensureProjectWork(next.independentLearningTypes));
      onProfileSaved(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      setError("Supervision & Learning could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveCloMethods = async (cloId: string, teachingMethodIds: string[]) => {
    const next = clos.map((clo) =>
      clo.id === cloId ? { ...clo, teachingMethodIds } : clo,
    );
    setSavingCloId(cloId);
    setError(null);
    try {
      if (!(await onPersist(next))) {
        setError("CLO supervision coverage could not be saved.");
      }
    } finally {
      setSavingCloId(null);
    }
  };

  const header = (
    <CourseSpecAuthoringHeader
      title="Supervision & Learning"
      description="Define how students learn through supervised independent project work. Final Project has no normal lecture syllabus."
      ready={ready}
      feedback={
        saving
          ? { state: "saving", label: "Saving…" }
          : saved
            ? { state: "saved", label: "Saved" }
            : error
              ? { state: "error", label: "Save failed" }
              : undefined
      }
      meta={
        <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {coveredClos}/{activeClos.length} active CLOs covered
        </span>
      }
      actions={
        clos.length > 0 ? (
          <Button size="sm" onClick={() => void saveProfile()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save changes
          </Button>
        ) : undefined
      }
    />
  );

  if (clos.length === 0) {
    return (
      <CourseSpecAuthoringStack className="pb-6">
        {header}
        <CourseSpecEmptyState
          title="Define CLOs first"
          description="The supervision framework must show how the Final Project supports its approved course learning outcomes."
        />
      </CourseSpecAuthoringStack>
    );
  }

  return (
    <CourseSpecAuthoringStack className="pb-6">
      {header}

      {error ? <CourseSpecNotice tone="error">{error}</CourseSpecNotice> : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Supervised project approach
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Describe guidance, consultation, feedback, and independent project work rather than lectures or weekly teaching topics.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Project-Based Learning
          </span>
        </div>

        <div className="mt-5 space-y-5">
          <ChoiceChips
            label="Supervision & learning philosophy"
            description="Choose the principles that guide the project experience."
            options={TEACHING_PHILOSOPHY_OPTIONS}
            values={philosophyTags}
            onChange={setPhilosophyTags}
          />

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-foreground">
              Supervision statement
            </span>
            <span className="block text-xs text-muted-foreground">
              Explain how the course team/supervisors guide students while students remain responsible for the project work.
            </span>
            <textarea
              value={philosophyStatement}
              onChange={(event) => setPhilosophyStatement(event.target.value)}
              rows={4}
              placeholder="Students work independently on an approved project and meet supervisors regularly for consultation, milestone review, technical guidance, and feedback…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <ChipMultiSelect
            label="Supervision / learning methods"
            options={teachingMethods}
            selectedIds={methodIds}
            onChange={setMethodIds}
            emptyMessage="Define suitable supervision or project-learning methods in Method Management first."
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          Independent project learning & support
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Record the project work, materials, and facilities students use between supervision meetings.
        </p>
        <div className="mt-5 space-y-5">
          <ChoiceChips
            label="Independent project work"
            description="Project Work is required for Final Project; select any additional independent learning formats used."
            options={INDEPENDENT_LEARNING_OPTIONS}
            values={projectIndependentLearning}
            onChange={(next) => setIndependentLearning(ensureProjectWork(next))}
          />
          <ChoiceChips
            label="Project learning materials"
            description="Materials that support investigation, implementation, evaluation, and reporting."
            options={TEACHING_LEARNING_MATERIAL_OPTIONS}
            values={materials}
            onChange={setMaterials}
          />
          <ChoiceChips
            label="Required project resources"
            description="Facilities or technologies required to carry out the project."
            options={REQUIRED_DELIVERY_RESOURCE_OPTIONS}
            values={resources}
            onChange={setResources}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          CLO supervision coverage
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Show how supervision and project-learning methods support every active CLO. This keeps the existing OBE readiness rule intact.
        </p>
        <div className="mt-5 space-y-4">
          {activeClos.map((clo) => (
            <div key={clo.id} className="rounded-lg border border-border bg-muted/15 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {clo.code}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {clo.description || "No CLO description yet."}
                  </p>
                </div>
                {savingCloId === clo.id ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </span>
                ) : null}
              </div>
              <ChipMultiSelect
                label={`Supervision / learning methods for ${clo.code}`}
                options={teachingMethods}
                selectedIds={clo.teachingMethodIds}
                onChange={(ids) => void saveCloMethods(clo.id, ids)}
              />
            </div>
          ))}
        </div>
      </section>
    </CourseSpecAuthoringStack>
  );
}
