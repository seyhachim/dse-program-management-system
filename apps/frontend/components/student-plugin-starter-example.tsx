"use client";

import { useEffect, useState } from "react";
import type { StudentPluginStarterWelcome } from "@dse-pms/shared-types";
import { api } from "@/lib/api";

/**
 * Issue #1302: reusable teaching example, not a mounted production page.
 * A maintainer must explicitly approve a Next.js route and navigation entry.
 */
export function StudentPluginStarterExample({ programmeId }: { programmeId: string }) {
  const [data, setData] = useState<StudentPluginStarterWelcome | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    api.get<StudentPluginStarterWelcome>(
      `/api/student-plugin-starter/welcome?programmeId=${encodeURIComponent(programmeId)}`,
    ).then((result) => {
      if (active) setData(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load example");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [programmeId]);

  return (
    <section aria-label="Student plugin demonstration" className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-foreground">Student Plugin Starter</h2>
      {loading ? <p role="status">Loading example…</p> : null}
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      {!loading && !error && !data ? <p>No demonstration content available.</p> : null}
      {data ? (
        <div className="space-y-1">
          <p className="font-medium">{data.title}</p>
          <p>{data.message}</p>
          <p className="text-sm text-muted-foreground">Programme: {data.programmeId}</p>
        </div>
      ) : null}
    </section>
  );
}
