"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OpportunityKind, type OpportunityView } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { opportunitiesApi } from "@/lib/opportunities";
import { preparePosterUpload, posterFileSize, validatePosterSource, type PreparedPoster } from "@/lib/opportunity-poster-compression";
import { protectedQueryKey } from "@/lib/query-client";

const control = "mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const initialForm = {
  type: "competition" as OpportunityKind, title: "", organizer: "", summary: "",
  eligibility: "", sourceUrl: "", applicationUrl: "", deadline: "", deadlineTime: "",
};

export function ManageOpportunitiesClient() {
  const { me, loading } = useMe();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterStats, setPosterStats] = useState<PreparedPoster | null>(null);
  const [posterProcessing, setPosterProcessing] = useState(false);
  // Ignore results from an earlier file selection when the user chooses another.
  const posterSelection = useRef(0);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    if (!posterFile) { setPosterPreview(null); return; }
    const url = URL.createObjectURL(posterFile);
    setPosterPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [posterFile]);
  const [busy, setBusy] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const staff = me?.roles.some((r) => r === "admin" || r === "program_coordinator");
  const key = protectedQueryKey({ userId: me?.id ?? "pending" }, "opportunities", "manage");
  const reviewKey = protectedQueryKey({ userId: me?.id ?? "pending" }, "opportunities", "reviews");
  const managed = useQuery({ queryKey: key, queryFn: opportunitiesApi.manage, enabled: Boolean(me?.id && staff), staleTime: 30_000 });
  const reviews = useQuery({ queryKey: reviewKey, queryFn: opportunitiesApi.pendingExperiences, enabled: Boolean(me?.id && staff), staleTime: 30_000 });

  async function perform(task: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      await task();
      await Promise.all([queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: reviewKey })]);
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save");
    } finally { setBusy(false); }
  }

  function startEditing(item: OpportunityView) {
    setEditingId(item.id);
    setForm({
      type: item.type, title: item.title, organizer: item.organizer,
      summary: item.summary, eligibility: item.eligibility, sourceUrl: item.sourceUrl,
      applicationUrl: item.applicationUrl ?? "", deadline: item.deadline ?? "", deadlineTime: item.deadlineTime ?? "",
    });
    posterSelection.current += 1;
    setPosterFile(null);
    setPosterStats(null);
    setPosterProcessing(false);
    document.getElementById("opportunity-editor")?.scrollIntoView({ behavior: "smooth" });
  }

  async function choosePoster(file: File | null) {
    const selection = ++posterSelection.current;
    setPosterFile(null);
    setPosterStats(null);
    setPosterProcessing(Boolean(file));
    setError("");
    if (!file) return;
    try {
      validatePosterSource(file);
      const prepared = await preparePosterUpload(file);
      if (selection !== posterSelection.current) return;
      setPosterFile(prepared.file);
      setPosterStats(prepared);
    } catch (cause) {
      if (selection === posterSelection.current) {
        setError(cause instanceof Error ? cause.message : "Poster optimization failed");
      }
    } finally {
      if (selection === posterSelection.current) setPosterProcessing(false);
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (posterProcessing) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const input = {
        type: form.type, title: form.title.trim(), organizer: form.organizer.trim(),
        summary: form.summary.trim(), eligibility: form.eligibility.trim(),
        sourceUrl: form.sourceUrl.trim(), applicationUrl: form.applicationUrl.trim() || null,
        deadline: form.deadline || null, deadlineTime: form.deadline ? form.deadlineTime || null : null,
      };
      const saved = editingId
        ? await opportunitiesApi.update(editingId, input)
        : await opportunitiesApi.create({ programmeId: "dse", ...input });
      let posterFailed = false;
      if (posterFile) {
        try { await opportunitiesApi.uploadPoster(saved.id, posterFile); }
        catch { posterFailed = true; }
      }
      posterSelection.current += 1;
      setForm(initialForm); setEditingId(null); setPosterFile(null); setPosterStats(null);
      await queryClient.invalidateQueries({ queryKey: key });
      setMessage(posterFailed
        ? "Draft saved, but the poster upload failed. Edit this draft to try the image again."
        : "Draft saved. Review the official source and publish separately.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save draft");
    } finally { setBusy(false); }
  };

  if (loading) return <p role="status">Checking staff access…</p>;
  if (!staff) return <p role="alert">Only authorized programme staff can manage opportunities.</p>;
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      <Link href="/opportunities" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">← Student opportunities</Link>
      <section id="opportunity-editor" className="rounded-2xl border bg-card p-5">
        <h1 className="text-xl font-semibold">{editingId ? "Edit opportunity draft" : "Create a verified opportunity"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manually confirm title, eligibility and deadline against the organizer website. Drafts never appear to students until published.</p>
        <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Opportunity type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as OpportunityKind })} className={control}>
              {OpportunityKind.options.map((t) => <option key={t} value={t}>{t.replace(/^\w/, (c) => c.toUpperCase())}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Organizer
            <input required minLength={2} maxLength={180} value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} className={control} />
          </label>
          <label className="text-sm font-medium md:col-span-2">Title
            <input required minLength={5} maxLength={180} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={control} />
          </label>
          <label className="text-sm font-medium md:col-span-2">Student-friendly summary
            <textarea required minLength={10} maxLength={3000} rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} className={control} />
          </label>
          <label className="text-sm font-medium md:col-span-2">Eligibility (do not infer)
            <textarea required minLength={5} maxLength={2000} rows={2} value={form.eligibility} onChange={(e) => setForm({ ...form, eligibility: e.target.value })} className={control} />
          </label>
          <label className="text-sm font-medium">Official source URL
            <input type="url" required pattern="https://.*" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://official-organizer..." className={control} />
          </label>
          <label className="text-sm font-medium">Application URL (optional)
            <input type="url" pattern="https://.*" value={form.applicationUrl} onChange={(e) => setForm({ ...form, applicationUrl: e.target.value })} className={control} />
          </label>
          <label className="text-sm font-medium">Deadline (optional)
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value, deadlineTime: e.target.value ? form.deadlineTime : "" })} className={control} />
            <span className="mt-1 block text-xs text-muted-foreground">Cambodia local calendar day; blank means unconfirmed</span>
          </label>
          <label className="text-sm font-medium">Deadline time (Cambodia, optional)
            <input type="time" value={form.deadlineTime} disabled={!form.deadline} onChange={(e) => setForm({ ...form, deadlineTime: e.target.value })} className={control} />
            <span className="mt-1 block text-xs text-muted-foreground">For example, 17:00. If blank, joining closes at midnight after the deadline date.</span>
          </label>
          <label className="text-sm font-medium md:col-span-2">Poster / thumbnail (optional)
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => {
              void choosePoster(event.target.files?.[0] ?? null);
            }} className="mt-1 block w-full rounded-lg border border-input bg-background p-3 text-sm" />
            <span className="mt-1 block text-xs text-muted-foreground">Automatically resized to fit 1200 × 1800 px and converted to WebP at 80% quality when smaller. Source images up to 20 MB; uploads remain limited to 5 MB. Promotional posters only, not private student records.</span>
            {posterProcessing ? <p role="status" className="mt-2 text-xs text-muted-foreground">Optimizing poster…</p> : null}
            {posterStats ? <p role="status" className="mt-2 text-xs text-muted-foreground">
              {posterStats.optimized ? "Optimized" : "Original retained"}: {posterFileSize(posterStats.originalBytes)} → {posterFileSize(posterStats.uploadBytes)}
            </p> : null}
            {posterPreview ? <img src={posterPreview} alt="Selected poster preview" className="mt-3 max-h-44 rounded-lg border object-contain" /> : null}
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button type="submit" disabled={busy || posterProcessing} className="min-h-11 rounded-lg bg-primary px-5 font-medium text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : posterProcessing ? "Optimizing…" : editingId ? "Save changes" : "Save draft"}</button>
            {editingId ? <button type="button" disabled={busy} onClick={() => { posterSelection.current += 1; setEditingId(null); setForm(initialForm); setPosterFile(null); setPosterStats(null); setPosterProcessing(false); }} className="min-h-11 rounded-lg border px-4 text-sm">Cancel edit</button> : null}
          </div>
        </form>
      </section>
      {message ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p> : null}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Review and publication</h2>
          <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)} className="min-h-10 rounded-lg border px-3 text-sm font-medium">
            {showArchived ? "Show active and draft" : "View archived"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Restore archived opportunities to draft, review their source and deadline, then publish again.</p>
        {managed.isError ? <p role="alert" className="mt-3 text-sm text-destructive">Could not load opportunity drafts.</p>
          : managed.isPending ? <p role="status" className="mt-3 text-sm">Loading…</p>
          : !managed.data?.length ? <p className="mt-3 text-sm text-muted-foreground">No opportunities created yet.</p>
          : !(managed.data ?? []).some((item) => showArchived ? item.status === "Archived" : item.status !== "Archived")
            ? <p className="mt-3 text-sm text-muted-foreground">{showArchived ? "No archived opportunities." : "No active or draft opportunities."}</p>
          : <div className="mt-3 space-y-3">{managed.data.filter((item) => showArchived ? item.status === "Archived" : item.status !== "Archived").map((item: OpportunityView) => (
            <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
              <div className="flex min-w-0 items-start gap-3">
                {item.posterUrl
                  ? <img src={item.posterUrl} alt={item.title + " poster"} loading="lazy" className="h-24 w-20 shrink-0 rounded-lg border object-cover" />
                  : <div aria-label="No poster" className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">No poster</div>}
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.type} · {item.status} · Deadline {item.deadline ?? "unknown"}{item.deadlineTime ? " " + item.deadlineTime + " ICT" : ""}</p>
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Check original source</a>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status === "Draft" ? <button type="button" disabled={busy} onClick={() => startEditing(item)} className="min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50">Edit / poster</button> : null}
                {item.status === "Draft" ? <button type="button" disabled={busy} onClick={() => void perform(() => opportunitiesApi.publish(item.id), "Opportunity published to students.")} className="min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50">Publish</button> : null}
                {item.status === "Archived" ? <button type="button" disabled={busy} onClick={() => void perform(() => opportunitiesApi.restore(item.id), "Restored to draft. Recheck the deadline and publish when ready.")} className="min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50">Restore to draft</button> : null}
                {item.status !== "Archived" ? <button type="button" disabled={busy} onClick={() => void perform(() => opportunitiesApi.archive(item.id), "Opportunity archived.")} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50">Archive</button> : null}
              </div>
            </article>
          ))}</div>}
      </section>
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Student experience review</h2>
        <p className="mt-1 text-sm text-muted-foreground">Consent alone does not prove a win. Verify the claimed outcome with evidence and the official organizer before approving. Approved experiences can be hidden again.</p>
        {reviews.isError ? <p role="alert" className="mt-3 text-sm text-destructive">Could not load student experience reviews.</p>
          : reviews.isPending ? <p role="status" className="mt-3 text-sm">Loading reviews…</p>
          : !reviews.data?.length ? <p className="mt-3 text-sm text-muted-foreground">No pending or approved experiences.</p>
          : <div className="mt-3 space-y-3">{reviews.data.map((item) => (
            <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
              <div className="space-y-1">
                <p className="font-semibold">{item.opportunityTitle} · {item.outcome}</p>
                <p className="text-xs text-muted-foreground">{item.status} · Consented {new Date(item.consentedAt).toLocaleDateString()}</p>
                {item.publicStudent ? <Link href={"/portfolio/" + encodeURIComponent(item.publicStudent.publicPortfolioSlug)} className="text-sm text-primary underline">{item.publicStudent.studentName}: {item.publicStudent.evidenceTitle}</Link> : <p className="text-sm text-destructive">Public verified portfolio evidence unavailable; approval blocked.</p>}
              </div>
              <div className="flex min-w-[240px] flex-1 flex-col gap-2 sm:max-w-sm">
                {item.status === "Pending" && item.publicStudent ? (
                  <label className="text-sm font-medium">
                    Review evidence / official result reference
                    <textarea
                      value={reviewNotes[item.id] ?? ""}
                      onChange={(event) => setReviewNotes((prev) => ({ ...prev, [item.id]: event.target.value }))}
                      placeholder="Example: organizer's published results page and matching award details"
                      maxLength={1000}
                      rows={2}
                      className={control}
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">Required before approval. Saved in the audit trail.</span>
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-2">
                {item.status === "Pending" && item.publicStudent ? <button type="button" disabled={busy || (reviewNotes[item.id] ?? "").trim().length < 12} onClick={() => void perform(() => opportunitiesApi.reviewExperience(item.id, "approve", reviewNotes[item.id] ?? ""), "Student experience approved.")} className="min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50">Approve</button> : null}
                <button type="button" disabled={busy} onClick={() => void perform(() => opportunitiesApi.reviewExperience(item.id, "hide", reviewNotes[item.id] ?? ""), "Student experience hidden.")} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50">Hide</button>
                </div>
              </div>
            </article>
          ))}</div>}
      </section>
    </div>
  );
}
