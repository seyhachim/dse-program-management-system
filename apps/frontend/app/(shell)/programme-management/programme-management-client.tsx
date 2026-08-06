"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ProgramCompetencyWithPlos,
  ProgrammeAcademicConfig,
} from "@dse-pms/shared-types";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

export function ProgrammeManagementClient() {
  const { me } = useMe();

  const canWrite = me?.permissions.includes("programme:write") ?? false;

  const [data, setData] = useState<ProgrammeAcademicConfig | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingCompetency, setEditingCompetency] =
    useState<ProgramCompetencyWithPlos | null>(null);

  const [selectedPloCodes, setSelectedPloCodes] = useState<Set<string>>(
    new Set(),
  );

  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.get<ProgrammeAcademicConfig>("/api/programme");

      setData(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load programme information",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openMappingDialog = (competency: ProgramCompetencyWithPlos) => {
    setEditingCompetency(competency);

    setSelectedPloCodes(new Set(competency.plos.map((plo) => plo.code)));

    setMappingError(null);
  };

  const closeMappingDialog = () => {
    if (savingMapping) return;

    setEditingCompetency(null);
    setSelectedPloCodes(new Set());
    setMappingError(null);
  };

  const togglePlo = (code: string, checked: boolean) => {
    setSelectedPloCodes((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }

      return next;
    });
  };

  const saveMapping = async () => {
    if (!editingCompetency) return;

    setSavingMapping(true);
    setMappingError(null);

    try {
      const updated = await api.put<ProgramCompetencyWithPlos>(
        `/api/programme/competencies/${editingCompetency.code}/plos`,
        {
          ploCodes: [...selectedPloCodes],
        },
      );

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          competencies: current.competencies.map((competency) =>
            competency.id === updated.id ? updated : competency,
          ),
        };
      });

      setEditingCompetency(null);
      setSelectedPloCodes(new Set());
    } catch (err) {
      setMappingError(
        err instanceof ApiError ? err.message : "Failed to save PLO mapping",
      );
    } finally {
      setSavingMapping(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Loading programme information…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No programme information available.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Programme
          </p>

          <h2 className="mt-2 text-xl font-semibold text-foreground">
            {data.title}
          </h2>

          <div className="mt-5 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-muted-foreground">
                Programme Learning Outcomes
              </p>

              <p className="mt-1 text-lg font-semibold">{data.plos.length}</p>
            </div>

            <div>
              <p className="text-muted-foreground">Program Competencies</p>

              <p className="mt-1 text-lg font-semibold">
                {data.competencies.length}
              </p>
            </div>
          </div>
        </section>

        <Tabs defaultValue="plos">
          <TabsList>
            <TabsTrigger value="plos">Programme Learning Outcomes</TabsTrigger>

            <TabsTrigger value="competencies">Program Competencies</TabsTrigger>
          </TabsList>

          <TabsContent value="plos" className="mt-4">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h3 className="font-semibold">Programme Learning Outcomes</h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Programme-level outcomes referenced by course learning
                  outcomes.
                </p>
              </div>

              <div className="divide-y divide-border">
                {data.plos.map((plo) => (
                  <div
                    key={plo.id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[90px_1fr]"
                  >
                    <div>
                      <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                        {plo.code}
                      </span>
                    </div>

                    <p className="text-sm leading-6 text-foreground">
                      {plo.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="competencies" className="mt-4">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h3 className="font-semibold">Program Competencies</h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Graduate competencies defined at programme level and aligned
                  with Programme Learning Outcomes.
                </p>
              </div>

              <div className="divide-y divide-border">
                {data.competencies.map((competency) => (
                  <div
                    key={competency.id}
                    className="grid gap-4 px-5 py-4 lg:grid-cols-[90px_1fr_auto]"
                  >
                    <div>
                      <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                        {competency.code}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {competency.name}
                      </p>

                      {competency.description ? (
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {competency.description}
                        </p>
                      ) : null}

                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          Mapped PLOs
                        </p>

                        {competency.plos.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {competency.plos.map((plo) => (
                              <span
                                key={plo.id}
                                title={plo.description}
                                className="inline-flex rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground"
                              >
                                {plo.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">
                            No PLO mapping
                          </p>
                        )}
                      </div>
                    </div>

                    {canWrite ? (
                      <div className="flex items-start">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMappingDialog(competency)}
                        >
                          Edit Mapping
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={editingCompetency !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeMappingDialog();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit PLO Mapping</DialogTitle>

            <DialogDescription>
              {editingCompetency
                ? `${editingCompetency.code} — ${editingCompetency.name}`
                : "Select the Programme Learning Outcomes associated with this competency."}
            </DialogDescription>
          </DialogHeader>

          {mappingError ? (
            <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-3 py-2 text-sm text-status-upcoming">
              {mappingError}
            </div>
          ) : null}

          <div className="space-y-2">
            {data.plos.map((plo) => {
              const checked = selectedPloCodes.has(plo.code);

              return (
                <label
                  key={plo.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      togglePlo(plo.code, Boolean(value))
                    }
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {plo.code}
                      </span>
                    </div>

                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {plo.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              {selectedPloCodes.size} PLO
              {selectedPloCodes.size === 1 ? "" : "s"} selected
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={closeMappingDialog}
                disabled={savingMapping}
              >
                Cancel
              </Button>

              <Button onClick={saveMapping} disabled={savingMapping}>
                {savingMapping ? "Saving…" : "Save Mapping"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
