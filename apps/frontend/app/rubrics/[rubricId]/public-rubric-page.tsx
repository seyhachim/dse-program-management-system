"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import {
  rubricScaleSummary,
  rubricTotalPoints,
  type PublicRubric,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { publicRubricsApi, typeChipClass } from "@/lib/rubrics";
import { RubricMatrix } from "@/app/(shell)/courses/[id]/spec/assessment/rubrics/rubric-matrix";

export function PublicRubricPage({ rubricId }: { rubricId: string }) {
  const [rubric, setRubric] = useState<PublicRubric | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError(null);

    publicRubricsApi
      .get(rubricId)
      .then((value) => {
        if (active) setRubric(value);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load rubric");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [rubricId]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading) {
    return (
      <PublicShell>
        <div className="rounded-2xl border border-border bg-card px-6 py-20 text-center text-sm text-muted-foreground">
          Loading published rubric…
        </div>
      </PublicShell>
    );
  }

  if (notFound) {
    return (
      <PublicShell>
        <div className="rounded-2xl border border-border bg-card px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Rubric not available</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            This rubric does not exist or has not been published. Only Active rubrics are available publicly.
          </p>
        </div>
      </PublicShell>
    );
  }

  if (error || !rubric) {
    return (
      <PublicShell>
        <div className="rounded-2xl border border-border bg-card px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Unable to load rubric</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {error ?? "Please try again."}
          </p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Published rubric
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${typeChipClass(rubric.type)}`}>
                  {rubric.type}
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">{rubric.name}</h1>
              {rubric.description ? (
                <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
                  {rubric.description}
                </p>
              ) : null}
            </div>

            <div className="flex gap-2 print:hidden">
              <Button variant="outline" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            <Meta label="Rating scale" value={rubricScaleSummary(rubric.levels)} />
            <Meta label="Criteria" value={String(rubric.criteria.length)} />
            <Meta label="Maximum score" value={String(rubricTotalPoints(rubric))} />
          </dl>
        </section>

        <RubricMatrix rubric={rubric} />

        <p className="px-1 pb-8 text-center text-xs text-muted-foreground print:hidden">
          This is the published read-only version of this rubric. Editing and management controls are not exposed on public pages.
        </p>
      </div>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-muted/20 px-4 py-8 sm:px-6 lg:px-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex items-center justify-between gap-4 print:mb-4">
          <div>
            <div className="text-sm font-semibold tracking-wide text-foreground">DSE Program Management System</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Public Rubric</div>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
