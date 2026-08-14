"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  AFFECTIVE_LEVELS,
  COGNITIVE_LEVELS,
  PLOS,
  PSYCHOMOTOR_LEVELS,
  type ProgrammeAcademicConfig,
} from "@dse-pms/shared-types";
import { Switch } from "@dse-pms/ui";
import { STATEMENT_MAX, wizardStepComplete, type CloForm } from "../clo-model";

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
          <Hint>
            Clear and measurable statement of what students will be able to do.
          </Hint>

          <span className="text-xs text-muted-foreground">
            {draft.description.length} / {STATEMENT_MAX}
          </span>
        </div>

        {statementError ? (
          <p className="text-xs text-status-live">
            A CLO statement is required.
          </p>
        ) : null}
      </Field>

      <Field label="C/A/P Taxonomy Level">
        <select
          value={draft.level}
          onChange={(e) => set({ level: e.target.value })}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">— Select level —</option>

          <optgroup label="Cognitive">
            {COGNITIVE_LEVELS.map((level) => (
              <option key={level.code} value={level.code}>
                {level.code} — {level.name}
              </option>
            ))}
          </optgroup>

          <optgroup label="Affective">
            {AFFECTIVE_LEVELS.map((level) => (
              <option key={level.code} value={level.code}>
                {level.code} — {level.name}
              </option>
            ))}
          </optgroup>

          <optgroup label="Psychomotor">
            {PSYCHOMOTOR_LEVELS.map((level) => (
              <option key={level.code} value={level.code}>
                {level.code} — {level.name}
              </option>
            ))}
          </optgroup>
        </select>

        <Hint>
          Select the learning domain and taxonomy level that best represent the
          expected learning outcome.
        </Hint>
      </Field>

      <Field label="Status" required>
        <label className="flex items-center gap-3">
          <Switch
            checked={draft.status === "active"}
            onCheckedChange={(value) =>
              set({
                status: value ? "active" : "inactive",
              })
            }
          />

          <span className="text-sm text-foreground">
            {draft.status === "active" ? "Active" : "Inactive"}
          </span>
        </label>

        <Hint>Inactive CLOs will not be used in mapping and reports.</Hint>
      </Field>
    </div>
  );
}

/* -------------------------------------------------------- Step 2 — PLO Mapping */

export function CloStepPlos({
  draft,
  toggle,
  programme,
}: {
  draft: CloForm;
  toggle: (id: string) => void;
  programme: ProgrammeAcademicConfig | null;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return PLOS;
    }

    return PLOS.filter(
      (plo) =>
        plo.id.toLowerCase().includes(q) ||
        plo.description.toLowerCase().includes(q),
    );
  }, [query]);

  const relatedCompetencies = useMemo(() => {
    if (!programme || draft.mappedPlos.length === 0) {
      return [];
    }

    return programme.competencies
      .map((competency) => {
        const matchedPlos = competency.plos.filter((plo) =>
          draft.mappedPlos.includes(plo.code),
        );

        return {
          competency,
          matchedPlos,
        };
      })
      .filter((item) => item.matchedPlos.length > 0);
  }, [programme, draft.mappedPlos]);

  return (
    <div className="space-y-5">
      {/* PLO selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Select the PLOs that this CLO contributes to.
          </p>

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
                    <span className="font-medium text-foreground">
                      {plo.id}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {plo.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}

          {filtered.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              No PLOs match your search.
            </li>
          ) : null}
        </ul>
      </div>

      {/* Programme competency context */}
      <div className="border-t border-border pt-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Related Program Competencies
          </h4>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Derived automatically from the selected PLOs and the programme-level
            competency alignment.
          </p>
        </div>

        {draft.mappedPlos.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">
              Select at least one PLO to see related Program Competencies.
            </p>
          </div>
        ) : !programme ? (
          <div className="mt-3 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">
              Programme competency information is unavailable.
            </p>
          </div>
        ) : relatedCompetencies.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">
              No Program Competencies are currently mapped to the selected PLOs.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {relatedCompetencies.map(({ competency, matchedPlos }) => (
              <div
                key={competency.id}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                    {competency.code}
                  </span>

                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {competency.name}
                    </p>

                    {competency.description ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {competency.description}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Via</span>

                      {matchedPlos.map((plo) => (
                        <span
                          key={plo.id}
                          className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
                        >
                          {plo.code}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Step 3 — Review */

export function CloStepReview({
  draft,
  code,
  onJump,
}: {
  draft: CloForm;
  code: string;
  onJump: (step: 1 | 2) => void;
}) {
  return (
    <div className="space-y-4">
      <ReviewCard
        title="CLO & C/A/P Taxonomy"
        onEdit={() => onJump(1)}
        incomplete={!wizardStepComplete(1, draft)}
      >
        <ReviewRow label="Code" value={code} />

        <ReviewRow label="Statement" value={draft.description || "—"} />

        <ReviewRow label="C/A/P Level" value={draft.level || "Not set"} />

        <ReviewRow
          label="Status"
          value={draft.status === "active" ? "Active" : "Inactive"}
        />
      </ReviewCard>

      <ReviewCard
        title="PLO Alignment"
        onEdit={() => onJump(2)}
        incomplete={!wizardStepComplete(2, draft)}
      >
        <ReviewRow
          label="PLOs"
          value={
            draft.mappedPlos.length
              ? draft.mappedPlos.join(", ")
              : "None selected"
          }
        />
      </ReviewCard>
    </div>
  );
}

/* ---------------------------------------------------------- Review components */

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

        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-medium text-accent-foreground hover:underline"
        >
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
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
