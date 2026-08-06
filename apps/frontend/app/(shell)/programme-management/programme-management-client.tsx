"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProgrammeAcademicConfig } from "@dse-pms/shared-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";

export function ProgrammeManagementClient() {
  const [data, setData] = useState<ProgrammeAcademicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <p className="text-muted-foreground">Programme Learning Outcomes</p>
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
                Programme-level outcomes referenced by course learning outcomes.
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
                Graduate competencies defined at programme level.
              </p>
            </div>

            <div className="divide-y divide-border">
              {data.competencies.map((competency) => (
                <div
                  key={competency.id}
                  className="grid gap-3 px-5 py-4 md:grid-cols-[90px_1fr_auto]"
                >
                  <div>
                    <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                      {competency.code}
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {competency.name}
                    </p>

                    {competency.description ? (
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {competency.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {competency.plos.length === 0
                      ? "No PLO mapping"
                      : `${competency.plos.length} PLO${
                          competency.plos.length === 1 ? "" : "s"
                        }`}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
