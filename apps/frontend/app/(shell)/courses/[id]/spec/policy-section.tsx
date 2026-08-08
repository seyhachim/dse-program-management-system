"use client";

import { useEffect, useState } from "react";
import { Check, Info, Loader2, Lock } from "lucide-react";
import { Button } from "@dse-pms/ui";
import type { PolicySection as PolicySectionValue } from "@dse-pms/shared-types";

const FIELDS: {
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

export function PolicySection({
  value,
  onPersist,
  disabled = false,
}: {
  value: PolicySectionValue;
  onPersist: (value: PolicySectionValue) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<PolicySectionValue>(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const update = (key: keyof PolicySectionValue, text: string) => {
    setDraft((current) => ({ ...current, [key]: text }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (await onPersist(draft)) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">
          Program Policies & Course Instructions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Programme policies provide the rules that apply across courses.
          Use this section only for course-specific instructions that supplement
          those policies.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-border bg-background p-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              Programme Policy
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Programme-level policies are managed by the programme and are
              read-only in the course specification. They should be applied
              consistently across courses.
            </p>

            <div className="mt-4 rounded-lg border border-border bg-background px-4 py-3">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-5 text-muted-foreground">
                  Programme policy content will be displayed here when it is
                  configured by the programme.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground">
            Course-Specific Instructions
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add only instructions specific to this course. These instructions
            should not conflict with programme or institutional policy.
          </p>
        </div>

        <div className="space-y-4">
          {FIELDS.map((field) => (
            <section
              key={field.key}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {field.title}
                </h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {field.description}
                </p>
              </div>

              <textarea
                value={draft[field.key]}
                onChange={(event) => update(field.key, event.target.value)}
                placeholder={field.placeholder}
                disabled={disabled || saving}
                rows={4}
                className="mt-4 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`${field.title} course-specific instructions`}
              />
            </section>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {saved ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" />
            Saved
          </span>
        ) : null}

        <Button onClick={save} disabled={disabled || saving}>
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : (
            "Save Course Instructions"
          )}
        </Button>
      </div>
    </div>
  );
}
