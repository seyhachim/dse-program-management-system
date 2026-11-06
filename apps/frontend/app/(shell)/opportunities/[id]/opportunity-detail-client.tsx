"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Award, ShieldCheck } from "lucide-react";
import { OpportunityOutcome } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { opportunitiesApi } from "@/lib/opportunities";
import { studentPortfolioApi } from "@/lib/student-portfolio";
import { protectedQueryKey } from "@/lib/query-client";

export function OpportunityDetailClient() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { me } = useMe();
  const [evidenceId, setEvidenceId] = useState("");
  const [outcome, setOutcome] = useState<OpportunityOutcome>("Participant");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isStudent = Boolean(me?.roles.includes("student"));
  const detail = useQuery({
    queryKey: protectedQueryKey({ userId: me?.id ?? "pending" }, "opportunities", id),
    queryFn: () => opportunitiesApi.detail(id),
    enabled: Boolean(me?.id && id),
    staleTime: 30_000,
  });
  const evidence = useQuery({
    queryKey: protectedQueryKey({ userId: me?.id ?? "pending" }, "portfolio", "evidence"),
    queryFn: studentPortfolioApi.evidence,
    enabled: Boolean(me?.id && isStudent),
  });
  const eligibleEvidence = (evidence.data ?? []).filter((item) =>
    item.visibility === "public" && (item.origin === "competition" || item.origin === "achievement"));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!evidenceId || !consent) return;
    setSubmitting(true); setNotice(null); setError(null);
    try {
      await opportunitiesApi.submitExperience(id, { evidenceId, outcome, consent: true });
      setNotice("Submitted for programme staff review. Your information is not shown yet.");
      setConsent(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit your experience");
    } finally { setSubmitting(false); }
  };

  const item = detail.data;
  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <Link href="/opportunities" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Back to opportunities</Link>
      {detail.isPending ? <p role="status">Loading opportunity…</p> : detail.isError || !item
        ? <p role="alert" className="rounded-xl border p-5 text-sm">This opportunity is unavailable, expired or outside your programme.</p>
        : <>
          <section className="rounded-2xl border bg-card p-5 md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">{item.type}</span>
              <span className="text-xs text-muted-foreground">Published by DSE programme staff</span>
            </div>
            <h1 className="mt-3 break-words text-2xl font-bold md:text-3xl">{item.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Organizer: {item.organizer}</p>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{item.summary}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-muted/60 p-4"><h2 className="text-xs font-semibold uppercase text-muted-foreground">Eligibility</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.eligibility}</p></div>
              <div className="rounded-xl bg-muted/60 p-4"><h2 className="text-xs font-semibold uppercase text-muted-foreground">Deadline</h2><p className="mt-2 text-sm">{item.deadline ?? "Not specified — check official source"}</p></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 font-medium hover:bg-muted">Official source <ArrowUpRight className="h-4 w-4" /></a>
              {item.applicationUrl ? <a href={item.applicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">Apply on organizer website <ArrowUpRight className="h-4 w-4" /></a> : null}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">PMS provides a staff-reviewed summary, not an eligibility guarantee or an application service.</p>
          </section>
          <section className="rounded-2xl border bg-card p-5 md:p-7">
            <div className="flex items-center gap-3"><Award className="h-6 w-6 text-primary" /><h2 className="text-lg font-semibold">DSE Student Experiences</h2></div>
            <p className="mt-2 text-sm text-muted-foreground">Voluntarily shared portfolio evidence, independently reviewed by programme staff.</p>
            {item.experiences.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {item.experiences.map((xp) => (
                  <article key={xp.id} className="rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Verified {xp.outcome.toLowerCase()}</div>
                    <h3 className="mt-2 font-semibold">{xp.studentName}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{xp.evidenceTitle}</p>
                    <Link href={"/portfolio/" + encodeURIComponent(xp.publicPortfolioSlug)} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">View public portfolio <ArrowUpRight className="h-4 w-4" /></Link>
                  </article>
                ))}
              </div>
            ) : <p className="mt-4 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">No past DSE experiences have been approved for public display yet.</p>}
          </section>
          {isStudent ? (
            <section className="rounded-2xl border bg-card p-5 md:p-7">
              <h2 className="text-lg font-semibold">Share your experience (optional)</h2>
              <p className="mt-2 text-sm text-muted-foreground">If you joined this opportunity before, you can opt in. Only your public, lecturer/supervisor-verified competition or achievement portfolio evidence is eligible. Staff will review your claimed outcome before displaying it.</p>
              <form onSubmit={submit} className="mt-4 max-w-xl space-y-4">
                <label className="block text-sm font-medium">Public portfolio evidence
                  <select required value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm">
                    <option value="">Select your verified public evidence</option>
                    {eligibleEvidence.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">Your result
                  <select value={outcome} onChange={(e) => setOutcome(e.target.value as OpportunityOutcome)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm">
                    {OpportunityOutcome.options.map((result) => <option key={result} value={result}>{result}</option>)}
                  </select>
                </label>
                <label className="flex items-start gap-3 text-sm leading-6">
                  <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
                  I consent to publicly show my name, selected verified evidence and result on this opportunity after staff review. I can unpublish my portfolio evidence later.
                </label>
                {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                <button type="submit" disabled={submitting || !consent || !evidenceId} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">{submitting ? "Submitting…" : "Submit for review"}</button>
                {!eligibleEvidence.length ? <p className="text-sm text-muted-foreground">No eligible evidence is currently public. Add and verify competition/achievement evidence in <Link href="/portal/portfolio" className="text-primary underline">your portfolio</Link> first.</p> : null}
              </form>
            </section>
          ) : null}
        </>}
    </div>
  );
}
