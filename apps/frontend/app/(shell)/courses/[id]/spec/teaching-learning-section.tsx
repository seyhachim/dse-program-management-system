"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
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

  const [savingCloId, setSavingCloId] = useState<string | null>(null);
  const [savedCloId, setSavedCloId] = useState<string | null>(null);
  const [errorCloId, setErrorCloId] = useState<string | null>(null);

  const assignedCount = useMemo(
    () => clos.filter((clo) => clo.teachingMethodIds.length > 0).length,
    [clos],
  );

  const completionPercent =
    clos.length > 0 ? Math.round((assignedCount / clos.length) * 100) : 0;

  const updateMethods = async (cloId: string, teachingMethodIds: string[]) => {
    const next = clos.map((clo) =>
      clo.id === cloId ? { ...clo, teachingMethodIds } : clo,
    );

    setSavingCloId(cloId);
    setSavedCloId(null);
    setErrorCloId(null);

    try {
      const ok = await onPersist(next);

      if (!ok) {
        setErrorCloId(cloId);
        return;
      }

      setSavedCloId(cloId);

      window.setTimeout(() => {
        setSavedCloId((current) => (current === cloId ? null : current));
      }, 2500);
    } catch {
      setErrorCloId(cloId);
    } finally {
      setSavingCloId((current) => (current === cloId ? null : current));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">
          Teaching &amp; Learning
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
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
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Teaching method coverage
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {assignedCount} of {clos.length} CLO
                  {clos.length === 1 ? "" : "s"} configured
                </p>
              </div>

              <span className="text-sm font-semibold text-foreground">
                {completionPercent}%
              </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </section>

          <div className="space-y-4">
            {clos.map((clo) => {
              const saving = savingCloId === clo.id;
              const saved = savedCloId === clo.id;
              const hasError = errorCloId === clo.id;

              return (
                <section
                  key={clo.id}
                  className="rounded-xl border border-border bg-card"
                >
                  <div className="border-b border-border px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                          {clo.code}
                        </span>

                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-6 text-foreground">
                            {clo.description || "No CLO statement provided"}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">
                              PLO alignment:
                            </span>

                            {clo.mappedPlos.length > 0 ? (
                              clo.mappedPlos.map((plo) => (
                                <span
                                  key={plo}
                                  className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
                                >
                                  {plo}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                None
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {saving ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Saving…
                          </span>
                        ) : saved ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" />
                            Saved
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Teaching Methods
                      </h3>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Choose one or more methods that support achievement of{" "}
                        {clo.code}.
                      </p>
                    </div>

                    <ChipMultiSelect
                      label={`Teaching methods for ${clo.code}`}
                      options={teachingMethods}
                      selectedIds={clo.teachingMethodIds}
                      onChange={(ids) => {
                        void updateMethods(clo.id, ids);
                      }}
                      emptyMessage="No teaching methods defined yet."
                    />

                    {hasError ? (
                      <div className="mt-3 rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2">
                        <p className="text-xs text-status-live">
                          Teaching methods could not be saved. Please try again.
                        </p>
                      </div>
                    ) : clo.teachingMethodIds.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          No teaching method is assigned to this CLO yet.
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {clo.teachingMethodIds.length} teaching method
                        {clo.teachingMethodIds.length === 1 ? "" : "s"}{" "}
                        assigned.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
