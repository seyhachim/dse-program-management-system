"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  Pencil,
} from "lucide-react";
import { Button } from "@dse-pms/ui";
import type {
  PolicySection as PolicySectionValue,
  ProgramPolicy,
} from "@dse-pms/shared-types";
import {
  mergePolicyFieldForSave,
  reconcilePolicyDraftWithPersisted,
} from "./policies-responsibilities-model";

export const POLICY_FIELDS: {
  key: keyof PolicySectionValue;
  title: string;
  description: string;
  placeholder: string;
}[] = [
  {
    key: "attendancePreparation",
    title: "Attendance & Preparation",
    description:
      "Add course-specific instructions only. Programme-wide attendance requirements are controlled by the programme.",
    placeholder:
      "Example: Students should review the assigned material before each class and participate actively in practical activities.",
  },
  {
    key: "academicIntegrity",
    title: "Academic Integrity",
    description:
      "Add course-specific instructions that supplement the programme's academic-integrity policy.",
    placeholder:
      "Example: Individual assignments must be completed independently unless collaboration is explicitly permitted.",
  },
  {
    key: "assignmentsLateSubmission",
    title: "Assignments & Late Submission",
    description:
      "Add course-specific submission instructions. Do not override programme-wide late-submission rules here.",
    placeholder:
      "Example: Submit assignments through the LMS before the stated deadline. Include any course-specific submission instructions.",
  },
  {
    key: "examinationRules",
    title: "Examination Rules",
    description:
      "Add course-specific examination instructions that are consistent with programme examination regulations.",
    placeholder:
      "Example: Bring a student ID to the examination and follow the permitted-materials instructions provided by the programme.",
  },
  {
    key: "penaltiesConsequences",
    title: "Penalties & Consequences",
    description:
      "Add course-specific consequences only where permitted by programme policy. Do not redefine institutional penalties.",
    placeholder:
      "Example: Course-specific consequences or escalation instructions that supplement the programme policy.",
  },
];

export const EMPTY_POLICY: PolicySectionValue = {
  attendancePreparation: "",
  academicIntegrity: "",
  assignmentsLateSubmission: "",
  examinationRules: "",
  penaltiesConsequences: "",
};

export function policyAdditionCount(value: PolicySectionValue): number {
  return POLICY_FIELDS.filter((field) => value[field.key].trim().length > 0).length;
}

export function PolicySection({
  value,
  onPersist,
  programPolicy,
  disabled = false,
}: {
  value: PolicySectionValue;
  programPolicy: ProgramPolicy | null;
  onPersist: (value: PolicySectionValue) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<PolicySectionValue>(value);
  const [expanded, setExpanded] = useState<keyof PolicySectionValue | null>(null);
  const [editing, setEditing] = useState<keyof PolicySectionValue | null>(null);
  const [saving, setSaving] = useState<keyof PolicySectionValue | null>(null);
  const [saved, setSaved] = useState<keyof PolicySectionValue | null>(null);
  const previousPersisted = useRef(value);

  useEffect(() => {
    const previous = previousPersisted.current;
    setDraft((current) =>
      reconcilePolicyDraftWithPersisted(current, previous, value),
    );
    previousPersisted.current = value;
  }, [value]);

  const additions = useMemo(() => policyAdditionCount(value), [value]);

  const toggle = (key: keyof PolicySectionValue) => {
    if (editing === key && draft[key] !== value[key]) return;
    setExpanded((current) => (current === key ? null : key));
    if (editing === key) setEditing(null);
  };

  const update = (key: keyof PolicySectionValue, text: string) => {
    setDraft((current) => ({ ...current, [key]: text }));
    setSaved(null);
  };

  const cancel = (key: keyof PolicySectionValue) => {
    setDraft((current) => ({ ...current, [key]: value[key] }));
    setEditing(null);
  };

  const save = async (key: keyof PolicySectionValue) => {
    const next = mergePolicyFieldForSave(value, key, draft[key]);
    setSaving(key);
    setSaved(null);
    try {
      if (await onPersist(next)) {
        setDraft((current) => ({ ...current, [key]: next[key] }));
        setEditing(null);
        setSaved(key);
        window.setTimeout(() => setSaved((current) => (current === key ? null : current)), 2500);
      }
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Programme & Course Policies</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Programme rules are inherited and read-only. Add only requirements that are specific to this course.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {POLICY_FIELDS.length} areas · {additions} course {additions === 1 ? "addition" : "additions"}
        </span>
      </div>

      <div className="mt-5 space-y-2.5">
        {POLICY_FIELDS.map((field) => {
          const isExpanded = expanded === field.key;
          const isEditing = editing === field.key;
          const isSaving = saving === field.key;
          const isSaved = saved === field.key;
          const isDirty = draft[field.key] !== value[field.key];
          const programmeText = programPolicy?.[field.key]?.trim() ?? "";
          const courseText = value[field.key].trim();

          return (
            <section key={field.key} className="overflow-hidden rounded-xl border border-border bg-background">
              <button
                type="button"
                onClick={() => toggle(field.key)}
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40"
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{field.title}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Lock className="h-3 w-3" /> Programme
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {courseText ? "Course-specific requirement added" : "No course-specific requirement"}
                  </p>
                </div>
                {isSaved ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> Saved
                  </span>
                ) : null}
              </button>

              {isExpanded ? (
                <div className="border-t border-border px-4 py-4">
                  <div className="rounded-lg border border-border bg-muted/35 px-3.5 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Programme policy
                    </div>
                    {programmeText ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {programmeText}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        No programme policy has been configured for this area yet.
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Course-specific requirement
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{field.description}</p>
                      </div>
                      {!disabled && !isEditing ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(field.key)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> {courseText ? "Edit" : "Add"}
                        </Button>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div className="mt-3">
                        <textarea
                          value={draft[field.key]}
                          onChange={(event) => update(field.key, event.target.value)}
                          placeholder={field.placeholder}
                          disabled={isSaving}
                          rows={5}
                          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`${field.title} course-specific instructions`}
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <span className={isDirty ? "text-xs font-medium text-amber-700 dark:text-amber-300" : "text-xs text-muted-foreground"}>
                            {isDirty ? "Unsaved changes" : "No changes"}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => cancel(field.key)} disabled={isSaving}>
                              Cancel
                            </Button>
                            <Button type="button" size="sm" onClick={() => save(field.key)} disabled={isSaving || !isDirty}>
                              {isSaving ? (
                                <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>
                              ) : (
                                "Save changes"
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : courseText ? (
                      <p className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-card px-3.5 py-3 text-sm leading-6 text-foreground">
                        {courseText}
                      </p>
                    ) : (
                      <div className="mt-3 rounded-lg border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
                        No additional course requirement.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {!programPolicy ? (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Programme policy could not be loaded. Course-specific instructions remain separate and can still be edited in draft Course Specs.
        </p>
      ) : null}
    </section>
  );
}
