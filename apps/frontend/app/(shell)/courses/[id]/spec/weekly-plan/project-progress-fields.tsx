"use client";

import type { WeekProjectProgress } from "@/lib/teaching-learning";

export function ProjectProgressFields({
  value,
  onChange,
}: {
  value: WeekProjectProgress;
  onChange: (patch: Partial<WeekProjectProgress>) => void;
}) {
  return (
    <section className="mt-6 rounded-xl border border-violet-200/70 bg-violet-50/40 p-4 dark:border-violet-900/50 dark:bg-violet-950/15">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          Project-Based Learning
        </p>
        <h3 className="mt-1 text-sm font-semibold text-foreground">
          Project Progress This Week
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Record the project milestone students should reach during this week.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Milestone / Stage">
          <input
            value={value.milestone}
            onChange={(event) => onChange({ milestone: event.target.value })}
            placeholder="e.g. Data collection plan"
            className={inputClass}
          />
        </Field>

        <Field label="Status">
          <select
            value={value.status}
            onChange={(event) =>
              onChange({
                status: event.target.value as WeekProjectProgress["status"],
              })
            }
            className={inputClass}
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Expected Progress">
          <textarea
            rows={3}
            value={value.expectedProgress}
            onChange={(event) =>
              onChange({ expectedProgress: event.target.value })
            }
            placeholder="What should students complete or demonstrate by the end of this week?"
            className={`${inputClass} min-h-[84px] resize-y`}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Deliverable (optional)">
          <input
            value={value.deliverable}
            onChange={(event) => onChange({ deliverable: event.target.value })}
            placeholder="e.g. EDA notebook, prototype, progress presentation"
            className={inputClass}
          />
        </Field>
      </div>
    </section>
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
    <label className="block">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
