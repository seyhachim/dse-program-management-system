"use client";

import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, MessageSquareText, Star } from "lucide-react";
import type { CourseDeliveryOffering } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { courseDeliveryApi } from "@/lib/course-delivery";
import { Topbar } from "../topbar";

export function FeedbackSummariesClient() {
  const [offerings, setOfferings] = useState<CourseDeliveryOffering[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await courseDeliveryApi.offerings();
      setOfferings(rows);
      setSelectedId((current) => rows.some((row) => row.offeringId === current) ? current : (rows[0]?.offeringId ?? ""));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not load feedback summaries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selected = offerings.find((row) => row.offeringId === selectedId) ?? null;

  return (
    <>
      <Topbar title="Feedback" subtitle="Review anonymous course feedback without exposing student identity." />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          {loading ? <StateCard>Loading your course sections…</StateCard> : error ? <StateCard>{error}</StateCard> : !offerings.length ? <StateCard>No assigned course sections.</StateCard> : selected ? (
            <>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-primary">{selected.code}</span>
                      <span className="rounded-lg bg-muted px-2.5 py-1">Section {selected.sectionCode}</span>
                      <span className="rounded-lg bg-muted px-2.5 py-1">{selected.term}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-bold">{selected.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Summaries are section-specific and remain hidden until the anonymity threshold is reached.</p>
                  </div>
                  <label className="text-sm font-medium">Course section
                    <select value={selected.offeringId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 block h-10 min-w-72 rounded-lg border border-input bg-background px-3 text-sm">
                      {offerings.map((offering) => <option key={offering.offeringId} value={offering.offeringId}>{offering.code} · Section {offering.sectionCode} · {offering.term}</option>)}
                    </select>
                  </label>
                </div>
              </section>

              <FeedbackSummary offering={selected} />
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

function FeedbackSummary({ offering }: { offering: CourseDeliveryOffering }) {
  const summary = offering.feedback;
  if (!summary.available) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <LockKeyhole className="mx-auto h-9 w-9 text-primary" />
          <h3 className="mt-3 font-semibold">Waiting for more anonymous responses</h3>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            {summary.responseCount} of {summary.minimumResponses} required responses received. Ratings, workload, and comments stay hidden until the privacy threshold is reached.
          </p>
        </div>
      </section>
    );
  }

  const total = Math.max(summary.responseCount, 1);
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={MessageSquareText} label="Anonymous responses" value={String(summary.responseCount)} />
        <Metric icon={Star} label="Overall experience" value={`${summary.averages?.overall ?? 0}/5`} />
        <Metric icon={Star} label="Teaching clarity" value={`${summary.averages?.teachingClarity ?? 0}/5`} />
        <Metric icon={Star} label="Assessment clarity" value={`${summary.averages?.assessmentClarity ?? 0}/5`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Workload perception" description="Aggregated across all anonymous responses.">
          <div className="space-y-4">
            {(["light", "appropriate", "heavy"] as const).map((key) => <WorkloadBar key={key} label={key} count={summary.workload[key]} total={total} />)}
          </div>
        </Panel>
        <Panel title="What helped learning" description="Comments are shown without student identity.">
          <CommentList comments={summary.positiveComments} empty="No positive comments submitted." />
        </Panel>
        <Panel title="What should improve" description="Use repeated themes to inform the next teaching adjustment.">
          <CommentList comments={summary.improvementComments} empty="No improvement comments submitted." />
        </Panel>
        <Panel title="Privacy rule" description="Individual responses are never shown before the threshold.">
          <p className="text-sm text-muted-foreground">This summary is available because at least {summary.minimumResponses} students responded. The lecturer view receives aggregates and anonymous comments only; no student identity is attached.</p>
        </Panel>
      </div>
    </div>
  );
}

function WorkloadBar({ label, count, total }: { label: string; count: number; total: number }) {
  const percent = Math.round((count / total) * 100);
  return <div><div className="mb-1 flex justify-between text-sm"><span className="capitalize">{label}</span><span className="text-muted-foreground">{count} · {percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div></div>;
}

function CommentList({ comments, empty }: { comments: string[]; empty: string }) {
  return <div className="space-y-2">{comments.map((comment, index) => <blockquote key={`${index}-${comment}`} className="rounded-xl bg-muted/40 p-3 text-sm">“{comment}”</blockquote>)}{!comments.length ? <p className="text-sm text-muted-foreground">{empty}</p> : null}</div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p></div>;
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p><div className="mt-4">{children}</div></section>;
}

function StateCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">{children}</div>;
}
