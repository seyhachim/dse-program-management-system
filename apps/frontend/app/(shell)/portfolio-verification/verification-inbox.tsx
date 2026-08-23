"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import type { StudentPortfolioVerificationInboxItem } from "@dse-pms/shared-types";
import { studentPortfolioApi } from "@/lib/student-portfolio";
import { PortalError, PortalLoading, usePortalData } from "../portal/portal-state";

function human(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

export function PortfolioVerificationInbox() {
  const load = useCallback(() => studentPortfolioApi.verificationInbox(), []);
  const { data, loading, error, setData } = usePortalData(load);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function decide(item: StudentPortfolioVerificationInboxItem, state: "verified" | "needs_changes" | "revoked") {
    let reason = "";
    if (state !== "verified") {
      reason = window.prompt(state === "needs_changes" ? "What should the student change?" : "Why is this verification being revoked?")?.trim() ?? "";
      if (!reason) return;
    }
    setBusyId(item.evidenceId); setActionError(null);
    try {
      await studentPortfolioApi.decideVerification(item.evidenceId, { state, reason });
      setData(await studentPortfolioApi.verificationInbox());
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not save verification decision"); }
    finally { setBusyId(null); }
  }

  if (loading) return <PortalLoading />;
  if (error || !data) return <PortalError message={error ?? "Could not load verification inbox"} />;

  return <div className="mx-auto max-w-5xl space-y-5">
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 text-primary" /><div><h1 className="text-xl font-semibold">Portfolio Evidence Review</h1><p className="mt-1 text-sm text-muted-foreground">Only evidence within your actual Offering/co-lecturer scope or an explicitly approved supervisor relationship appears here. Verification does not alter marks or academic records.</p></div></div></section>
    {actionError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</p> : null}
    {data.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No portfolio evidence currently requires or permits your review.</div> : <div className="space-y-4">{data.map((item) => <article key={item.evidenceId} className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.title}</h2><span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">{human(item.verification.state)}</span></div><p className="mt-1 text-sm font-medium text-muted-foreground">{item.studentName}{item.courseLabel ? ` · ${item.courseLabel}` : ""}</p>{item.summary ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.summary}</p> : null}{item.contribution ? <div className="mt-3 rounded-xl bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student contribution</p><p className="mt-1 text-sm">{item.contribution}</p>{item.role ? <p className="mt-1 text-xs text-muted-foreground">Role: {item.role}</p> : null}</div> : null}</div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" disabled={busyId === item.evidenceId} onClick={() => decide(item, "verified")} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Verify</button><button type="button" disabled={busyId === item.evidenceId} onClick={() => decide(item, "needs_changes")} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"><RotateCcw className="h-4 w-4" />Needs changes</button>{item.verification.state === "verified" ? <button type="button" disabled={busyId === item.evidenceId} onClick={() => decide(item, "revoked")} className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-50"><XCircle className="h-4 w-4" />Revoke</button> : null}</div></div></article>)}</div>}
  </div>;
}
