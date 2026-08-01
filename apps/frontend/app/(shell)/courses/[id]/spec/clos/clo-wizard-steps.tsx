"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  AFFECTIVE_LEVELS,
  COGNITIVE_LEVELS,
  FOCUS_LEVELS,
  PLOS,
  PSYCHOMOTOR_LEVELS,
  type Method,
} from "@dse-pms/shared-types";
import { Switch } from "@dse-pms/ui";
import {
  focusCodeOf,
  focusPercentOf,
  NOTES_MAX,
  STATEMENT_MAX,
  wizardStepComplete,
  type CloForm,
} from "../clo-model";
import { ReferenceGuide } from "../reference-guide";
import { ChipMultiSelect } from "./chip-multiselect";

type SetPatch = (patch: Partial<CloForm>) => void;

/* --------------------------------------------------------- Step 1 — CLO Info */

export function CloStepInfo({
  draft,
  code,
  set,
  touched,
}: {
  draft: CloForm;
  code: string;
  set: SetPatch;
  touched: boolean;
}) {
  const statementError = touched && draft.description.trim().length === 0;

  return (
    <div className="space-y-4">
      <Field label="CLO Code">
        <input
          readOnly
          value={code}
          className="h-9 w-full cursor-default rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
        />
        <Hint>Codes are numbered automatically by order (CLO1, CLO2…).</Hint>
      </Field>

      <Field label="CLO Statement" required>
        <textarea
          autoFocus
          value={draft.description}
          maxLength={STATEMENT_MAX}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Students will be able to…"
          className={`min-h-[140px] w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            statementError ? "border-status-live" : "border-border"
          }`}
        />
        <div className="flex items-center justify-between">
          <Hint>Clear and measurable statement of what students will be able to do.</Hint>
          <span className="text-xs text-muted-foreground">
            {draft.description.length} / {STATEMENT_MAX}
          </span>
        </div>
        {statementError ? <p className="text-xs text-status-live">A CLO statement is required.</p> : null}
      </Field>

      <Field label="Bloom's Taxonomy Level">
        <select
          value={draft.level}
          onChange={(e) => set({ level: e.target.value })}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">— Select level —</option>
          <optgroup label="Cognitive">
            {COGNITIVE_LEVELS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code} — {l.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Affective">
            {AFFECTIVE_LEVELS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code} — {l.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Psychomotor">
            {PSYCHOMOTOR_LEVELS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code} — {l.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Hint>The cognitive level this CLO addresses. Pick a verb from the helper to match it.</Hint>
      </Field>

      <Field label="Status" required>
        <label className="flex items-center gap-3">
          <Switch checked={draft.status === "active"} onCheckedChange={(v) => set({ status: v ? "active" : "inactive" })} />
          <span className="text-sm text-foreground">{draft.status === "active" ? "Active" : "Inactive"}</span>
        </label>
        <Hint>Inactive CLOs will not be used in mapping and reports.</Hint>
      </Field>
    </div>
  );
}

/* -------------------------------------------------------- Step 2 — PLO Mapping */

export function CloStepPlos({ draft, toggle }: { draft: CloForm; toggle: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PLOS;
    return PLOS.filter((p) => p.id.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Select the PLOs that this CLO contributes to.</p>
        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
          {draft.mappedPlos.length} selected
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search PLOs…"
          className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((plo) => {
          const checked = draft.mappedPlos.includes(plo.id);
          return (
            <li key={plo.id}>
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors ${
                  checked
                    ? "border-violet-400 bg-violet-50 dark:border-violet-700/60 dark:bg-violet-950/20"
                    : "border-border hover:border-violet-200 hover:bg-violet-50/50 dark:hover:border-violet-800/50 dark:hover:bg-violet-950/10"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  checked={checked}
                  onChange={() => toggle(plo.id)}
                />
                <span>
                  <span className="font-medium text-foreground">{plo.id}</span>{" "}
                  <span className="text-muted-foreground">{plo.description}</span>
                </span>
              </label>
            </li>
          );
        })}
        {filtered.length === 0 ? <li className="text-sm text-muted-foreground">No PLOs match your search.</li> : null}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------- Step 3 — Learning & Teaching */

export function CloStepLearning({
  draft,
  set,
  teachingMethods,
  courseTotalSlt,
}: {
  draft: CloForm;
  set: SetPatch;
  teachingMethods: Method[];
  courseTotalSlt: number | null;
}) {
  const focusPercent = focusPercentOf(draft.sltHours, courseTotalSlt);
  const focusCode = focusCodeOf(focusPercent);
  const focusName = FOCUS_LEVELS.find((f) => f.code === focusCode)?.name;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Student Learning Time</h4>
        <p className="text-xs text-muted-foreground">
          Hours of Student Learning Time this CLO accounts for. Across all CLOs these must add up to the
          course&apos;s total SLT; Focus and its F/M/P category are derived automatically from this CLO&apos;s
          share of that total.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="SLT hours">
            <input
              type="number"
              min={0}
              placeholder="e.g. 42"
              className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={draft.sltHours}
              onChange={(e) => set({ sltHours: e.target.value })}
            />
          </Field>
          <div className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Focus (auto)</span>
            <div
              className="flex h-9 w-full items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground"
              title="Derived from this CLO's share of the course's total SLT"
            >
              {focusCode ? `${focusCode} — ${focusName}` : "—"}
            </div>
          </div>
          <div className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Focus % (auto)</span>
            <div
              className="flex h-9 w-full items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground"
              title="This CLO's SLT hours ÷ the course's total SLT"
            >
              {focusPercent == null ? "—" : `${focusPercent}%`}
            </div>
          </div>
        </div>
        <ReferenceGuide title="Focus on PLO (F / M / P)" rows={[...FOCUS_LEVELS]} />
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Teaching Methods</h4>
        <p className="text-xs text-muted-foreground">Select the teaching methods used to deliver this CLO.</p>
        <ChipMultiSelect
          label="Teaching methods"
          options={teachingMethods}
          selectedIds={draft.teachingMethodIds}
          onChange={(ids) => set({ teachingMethodIds: ids })}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Step 4 — Assessment */

export function CloStepAssessment({
  draft,
  set,
  assessmentMethods,
}: {
  draft: CloForm;
  set: SetPatch;
  assessmentMethods: Method[];
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Assessment Methods</h4>
        <p className="text-xs text-muted-foreground">Select the assessment methods that measure this CLO.</p>
        <ChipMultiSelect
          label="Assessment methods"
          options={assessmentMethods}
          selectedIds={draft.assessmentMethodIds}
          onChange={(ids) => set({ assessmentMethodIds: ids })}
          emptyMessage="No assessment methods defined yet."
        />
      </div>

      <Field label="Notes">
        <textarea
          value={draft.notes}
          maxLength={NOTES_MAX}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Add any notes or comments about this CLO…"
          className="min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="flex justify-end">
          <span className="text-xs text-muted-foreground">
            {draft.notes.length} / {NOTES_MAX}
          </span>
        </div>
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------ Step 5 — Review */

export function CloStepReview({
  draft,
  code,
  teachingMethods,
  assessmentMethods,
  onJump,
}: {
  draft: CloForm;
  code: string;
  teachingMethods: Method[];
  assessmentMethods: Method[];
  onJump: (step: 1 | 2 | 3 | 4) => void;
}) {
  const methodName = (list: Method[], id: string) => list.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <ReviewCard title="CLO Information" onEdit={() => onJump(1)} incomplete={!wizardStepComplete(1, draft)}>
        <ReviewRow label="Code" value={code} />
        <ReviewRow label="Statement" value={draft.description || "—"} />
        <ReviewRow label="Bloom's Level" value={draft.level || "Not set"} />
        <ReviewRow label="Status" value={draft.status === "active" ? "Active" : "Inactive"} />
      </ReviewCard>

      <ReviewCard title="Mapped PLOs" onEdit={() => onJump(2)} incomplete={!wizardStepComplete(2, draft)}>
        <ReviewRow label="PLOs" value={draft.mappedPlos.length ? draft.mappedPlos.join(", ") : "None selected"} />
      </ReviewCard>

      <ReviewCard title="Learning & Teaching" onEdit={() => onJump(3)} incomplete={!wizardStepComplete(3, draft)}>
        <ReviewRow label="SLT Hours" value={draft.sltHours || "—"} />
        <ReviewRow
          label="Teaching Methods"
          value={draft.teachingMethodIds.length ? draft.teachingMethodIds.map((id) => methodName(teachingMethods, id)).join(", ") : "None selected"}
        />
      </ReviewCard>

      <ReviewCard title="Assessment" onEdit={() => onJump(4)} incomplete={!wizardStepComplete(4, draft)}>
        <ReviewRow
          label="Assessment Methods"
          value={
            draft.assessmentMethodIds.length
              ? draft.assessmentMethodIds.map((id) => methodName(assessmentMethods, id)).join(", ")
              : "None selected"
          }
        />
        <ReviewRow label="Notes" value={draft.notes || "—"} />
      </ReviewCard>
    </div>
  );
}

function ReviewCard({
  title,
  incomplete,
  onEdit,
  children,
}: {
  title: string;
  incomplete?: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {title}
          {incomplete ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              Incomplete
            </span>
          ) : null}
        </h4>
        <button type="button" onClick={onEdit} className="text-xs font-medium text-accent-foreground hover:underline">
          Edit
        </button>
      </div>
      <dl className="space-y-1 text-sm">{children}</dl>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- Shared bits */

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-status-live"> *</span> : null}
      </span>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
