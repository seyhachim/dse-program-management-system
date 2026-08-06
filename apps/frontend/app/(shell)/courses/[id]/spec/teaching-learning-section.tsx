"use client";

import { useMemo } from "react";
import type { Method } from "@dse-pms/shared-types";
import { ChipMultiSelect } from "./clos/chip-multiselect";
import { withCodes, type CloForm } from "./clo-model";

export function TeachingLearningSection({
  value,
  teachingMethods,
  onPersist,
}: {
  value: CloForm[];
  teachingMethods: Method[];
  onPersist: (items: CloForm[]) => Promise<boolean>;
}) {
  const clos = withCodes(value);
  const assignedCount = useMemo(
    () => clos.filter((clo) => clo.teachingMethodIds.length > 0).length,
    [clos],
  );

  const updateMethods = (cloId: string, teachingMethodIds: string[]) => {
    const next = clos.map((clo) =>
      clo.id === cloId ? { ...clo, teachingMethodIds } : clo,
    );
    void onPersist(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">
          Teaching &amp; Learning
        </h2>
        <p className="text-sm text-muted-foreground">
          Select the teaching methods used to help students achieve each course
          learning outcome.
        </p>
      </div>

      {clos.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            No CLOs available yet.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the course learning outcomes first, then return here to map
            teaching methods.
          </p>
        </section>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Teaching methods assigned for {assignedCount} of {clos.length} CLO
            {clos.length === 1 ? "" : "s"}.
          </div>

          <div className="space-y-3">
            {clos.map((clo) => (
              <section
                key={clo.id}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="mb-4">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                      {clo.code}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {clo.description || "No CLO statement provided"}
                      </p>
                      {clo.mappedPlos.length ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          PLO alignment: {clo.mappedPlos.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <ChipMultiSelect
                  label={`Teaching methods for ${clo.code}`}
                  options={teachingMethods}
                  selectedIds={clo.teachingMethodIds}
                  onChange={(ids) => updateMethods(clo.id, ids)}
                  emptyMessage="No teaching methods defined yet."
                />

                {clo.teachingMethodIds.length === 0 ? (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                    No teaching method is assigned to this CLO yet.
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
