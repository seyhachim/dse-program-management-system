"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleCheck, Lightbulb, Loader2 } from "lucide-react";
import type { Method } from "@dse-pms/shared-types";
import { ChipMultiSelect } from "../clos/chip-multiselect";
import { withCodes, type CloForm } from "../clo-model";
import {
  ACTIVE_LEARNING_CLUSTERS,
  INDEPENDENT_LEARNING_OPTIONS,
  RESOURCE_TYPE_OPTIONS,
  TEACHING_PHILOSOPHY_OPTIONS,
  TECHNOLOGY_OPTIONS,
} from "./strategy-catalog";

export function TeachingLearningWorkspace({ value, teachingMethods, onPersist }: {
  value: CloForm[];
  teachingMethods: Method[];
  onPersist: (items: CloForm[]) => Promise<boolean>;
}) {
  const clos = withCodes(value);
  const [savingCloId, setSavingCloId] = useState<string | null>(null);
  const [savedCloId, setSavedCloId] = useState<string | null>(null);
  const [philosophyTags, setPhilosophyTags] = useState<string[]>(["student-centered"]);
  const [philosophyStatement, setPhilosophyStatement] = useState("");
  const [courseMethodIds, setCourseMethodIds] = useState<string[]>(() => [...new Set(clos.flatMap((c) => c.teachingMethodIds))]);
  const [strategyIds, setStrategyIds] = useState<string[]>([]);
  const [independentLearning, setIndependentLearning] = useState<string[]>([]);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [technologyTypes, setTechnologyTypes] = useState<string[]>([]);

  const coveredClos = useMemo(() => clos.filter((c) => c.teachingMethodIds.length > 0).length, [clos]);
  const completion = [
    philosophyTags.length > 0 || philosophyStatement.trim().length > 0,
    courseMethodIds.length > 0,
    strategyIds.length > 0,
    independentLearning.length + resourceTypes.length + technologyTypes.length > 0,
    clos.length > 0 && coveredClos === clos.length,
  ];
  const completeCount = completion.filter(Boolean).length;

  const toggle = (id: string, values: string[], setValues: (next: string[]) => void) =>
    setValues(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);

  const updateMethods = async (cloId: string, teachingMethodIds: string[]) => {
    const next = clos.map((clo) => clo.id === cloId ? { ...clo, teachingMethodIds } : clo);
    setSavingCloId(cloId);
    setSavedCloId(null);
    try {
      if (await onPersist(next)) {
        setSavedCloId(cloId);
        window.setTimeout(() => setSavedCloId((id) => id === cloId ? null : id), 1800);
      }
    } finally {
      setSavingCloId(null);
    }
  };

  if (clos.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <p className="font-semibold">Define CLOs first</p>
      <p className="mt-1 text-sm text-muted-foreground">Teaching & Learning builds on the course learning outcomes.</p>
    </div>;
  }

  return <div className="space-y-5 pb-6">
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Teaching &amp; Learning</h2>
          <p className="mt-1 text-sm text-muted-foreground">Define the course-level philosophy and reusable teaching strategy. Weekly Plan remains the week-by-week execution workspace.</p>
        </div>
        <div className="sm:w-56">
          <div className="flex justify-between text-xs"><span>{completeCount} of 5 sections complete</span><span>{completeCount * 20}%</span></div>
          <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${completeCount * 20}%` }} /></div>
        </div>
      </div>
    </div>

    <Section number={1} title="Teaching Philosophy" prompt="How do you want students to learn in this course?" complete={completion[0]}>
      <div className="flex flex-wrap gap-2">{TEACHING_PHILOSOPHY_OPTIONS.map((o) => <Chip key={o.id} selected={philosophyTags.includes(o.id)} onClick={() => toggle(o.id, philosophyTags, setPhilosophyTags)}>{o.label}</Chip>)}</div>
      <textarea rows={3} value={philosophyStatement} onChange={(e) => setPhilosophyStatement(e.target.value)} placeholder="Optional: describe the learning experience you want to create." className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/20" />
    </Section>

    <Section number={2} title="Teaching Methods" prompt="How will you normally teach this course?" complete={completion[1]}>
      <div className="flex flex-wrap gap-2">{teachingMethods.map((m) => <Chip key={m.id} selected={courseMethodIds.includes(m.id)} onClick={() => toggle(m.id, courseMethodIds, setCourseMethodIds)}>{m.name}</Chip>)}</div>
    </Section>

    <Section number={3} title="Active Learning Strategies" prompt="Choose how students will actively participate in learning." complete={completion[2]}>
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><Lightbulb className="h-4 w-4" />Clustered for quick selection so lecturers do not need to scan one long list.</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{ACTIVE_LEARNING_CLUSTERS.map((cluster) => <div key={cluster.id} className="rounded-xl border border-border bg-muted/10 p-3.5">
        <h4 className="text-sm font-semibold">{cluster.label}</h4><p className="mt-0.5 text-xs text-muted-foreground">{cluster.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{cluster.strategies.slice(0, 3).map((s) => <Chip compact key={s.id} selected={strategyIds.includes(s.id)} onClick={() => toggle(s.id, strategyIds, setStrategyIds)}>{s.label}</Chip>)}</div>
        {cluster.strategies.length > 3 ? <button type="button" className="mt-3 text-xs font-medium text-primary">View more strategies</button> : null}
      </div>)}</div>
    </Section>

    <Section number={4} title="Independent Learning, Resources & Technology" prompt="Set course-level preferences. Actual files and links remain in Resources." complete={completion[3]}>
      <div className="grid gap-5 lg:grid-cols-3">
        <Group title="Independent learning" options={[...INDEPENDENT_LEARNING_OPTIONS]} selected={independentLearning} onToggle={(v) => toggle(v, independentLearning, setIndependentLearning)} />
        <Group title="Resource types" options={[...RESOURCE_TYPE_OPTIONS]} selected={resourceTypes} onToggle={(v) => toggle(v, resourceTypes, setResourceTypes)} />
        <Group title="Tools & technology" options={[...TECHNOLOGY_OPTIONS]} selected={technologyTypes} onToggle={(v) => toggle(v, technologyTypes, setTechnologyTypes)} />
      </div>
    </Section>

    <Section number={5} title="CLO Coverage Check" prompt="Make sure every CLO has teaching support. Detailed alignment remains in Constructive Alignment." complete={completion[4]}>
      <div className="space-y-2.5">{clos.map((clo) => <div key={clo.id} className="rounded-xl border border-border bg-background p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.9fr)_minmax(360px,1.4fr)_150px] xl:items-center">
          <div className="flex items-start gap-2.5"><span className="rounded-md bg-muted px-2 py-1 text-xs font-bold">{clo.code}</span><p className="text-sm font-medium">{clo.description}</p></div>
          <ChipMultiSelect label={`Teaching methods for ${clo.code}`} options={teachingMethods} selectedIds={clo.teachingMethodIds} onChange={(ids) => void updateMethods(clo.id, ids)} emptyMessage="No teaching methods defined yet." />
          <div className="flex justify-end">{savingCloId === clo.id ? <Status icon={<Loader2 className="h-4 w-4 animate-spin" />} text="Saving…" /> : savedCloId === clo.id ? <Status good icon={<Check className="h-4 w-4" />} text="Saved" /> : clo.teachingMethodIds.length ? <Status good icon={<CircleCheck className="h-4 w-4" />} text="Supported" /> : <Status icon={<AlertTriangle className="h-4 w-4" />} text="Needs attention" />}</div>
        </div>
      </div>)}</div>
    </Section>

    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
      <p className="font-semibold">How this supports Weekly Plan</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Teaching & Learning defines the course-level approach. Assessment defines how learning is measured. Weekly Plan will use both as contextual suggestions while the lecturer decides what actually happens each week.</p>
    </div>
  </div>;
}

function Section({ number, title, prompt, complete, children }: { number: number; title: string; prompt: string; complete: boolean; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{number}</span><div><div className="flex items-center gap-2"><h3 className="font-bold">{title}</h3>{complete ? <CircleCheck className="h-4 w-4 text-emerald-500" /> : null}</div><p className="mt-0.5 text-sm text-muted-foreground">{prompt}</p></div></div><div className="sm:pl-11">{children}</div></section>;
}

function Chip({ selected, compact = false, onClick, children }: { selected: boolean; compact?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-full border font-medium transition ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} ${selected ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted/40"}`}>{selected ? <Check className="h-3 w-3" /> : null}{children}</button>;
}

function Group({ title, options, selected, onToggle }: { title: string; options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><div className="mt-2 flex flex-wrap gap-1.5">{options.map((o) => <Chip compact key={o} selected={selected.includes(o)} onClick={() => onToggle(o)}>{o}</Chip>)}</div></div>;
}

function Status({ good = false, icon, text }: { good?: boolean; icon: React.ReactNode; text: string }) {
  return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${good ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{icon}{text}</span>;
}
