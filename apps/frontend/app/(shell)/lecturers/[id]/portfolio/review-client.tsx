"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import {
  LECTURER_PORTFOLIO_ITEM_LABELS,
  formatLecturerDisplayName,
  type Lecturer,
  type LecturerPortfolioItem,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { lecturersApi } from "@/lib/lecturers";
import { LecturerAvatar } from "@/components/lecturer-avatar";

export function LecturerPortfolioReviewClient({ lecturerId }: { lecturerId: string }) {
  const [lecturer, setLecturer] = useState<Lecturer | null>(null);
  const [items, setItems] = useState<LecturerPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profile, evidence] = await Promise.all([
        lecturersApi.get(lecturerId),
        lecturersApi.portfolioItemsForLecturer(lecturerId),
      ]);
      setLecturer(profile);
      setItems(evidence);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load lecturer portfolio evidence");
    } finally {
      setLoading(false);
    }
  }, [lecturerId]);

  useEffect(() => { void load(); }, [load]);

  const review = async (item: LecturerPortfolioItem, action: "verified" | "rejected") => {
    const promptText = action === "verified"
      ? "Optional verification note (source checked, credential confirmed, etc.)"
      : "Reason this evidence needs correction";
    const note = window.prompt(promptText, "") ?? "";
    if (action === "rejected" && note.trim().length === 0) return;

    setReviewingId(item.id);
    setError(null);
    setNotice(null);
    try {
      await lecturersApi.reviewPortfolioItem(lecturerId, item.id, { action, note });
      setNotice(action === "verified" ? "Evidence verified." : "Evidence returned for correction.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record review decision");
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/lecturers" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to lecturers
      </Link>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          {lecturer ? <LecturerAvatar name={lecturer.name} imageUrl={lecturer.profileImageUrl} size="md" /> : <div className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>}
          <div>
            <h2 className="font-semibold text-foreground">
              {lecturer ? formatLecturerDisplayName(lecturer.name, lecturer.honorific) : "Lecturer portfolio"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review professional evidence only. Verification records provenance; it does not rewrite Course/Offering assignments, approved CourseSpecs, results, curriculum, or QA approvals.
            </p>
          </div>
        </div>
      </section>

      {notice ? <p className="rounded-lg border border-status-live bg-status-live-bg px-4 py-3 text-sm text-status-live">{notice}</p> : null}
      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading evidence…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium text-foreground">No professional evidence to review</p>
          <p className="mt-1 text-sm text-muted-foreground">The lecturer has not added portfolio evidence yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{LECTURER_PORTFOLIO_ITEM_LABELS[item.kind]}</p>
                  <h3 className="mt-1 font-semibold text-foreground">{item.title}</h3>
                  {item.organization ? <p className="mt-1 text-sm text-muted-foreground">{item.organization}</p> : null}
                </div>
                <VerificationBadge status={item.verificationStatus} />
              </div>

              {item.description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p> : null}
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {item.role ? <Meta label="Role / contribution" value={item.role} /> : null}
                {item.identifier ? <Meta label="Identifier" value={item.identifier} /> : null}
                {item.startDate ? <Meta label="Period" value={`${item.startDate}${item.endDate ? ` → ${item.endDate}` : ""}`} /> : null}
                <Meta label="Visibility" value={item.isPublic ? "Public-eligible" : "Private"} />
              </dl>

              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Open supporting source
                </a>
              ) : null}

              {item.verificationEvents.length > 0 ? (
                <div className="mt-4 rounded-lg bg-muted/25 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audit history</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    {item.verificationEvents.map((event) => (
                      <li key={event.id}>{event.action} · {event.actor.name} · {new Date(event.createdAt).toLocaleString()}{event.note ? ` · ${event.note}` : ""}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button type="button" size="sm" disabled={reviewingId === item.id} onClick={() => void review(item, "verified")}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Verify
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={reviewingId === item.id} onClick={() => void review(item, "rejected")}>
                  <XCircle className="mr-1.5 h-4 w-4" /> Needs correction
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function VerificationBadge({ status }: { status: LecturerPortfolioItem["verificationStatus"] }) {
  const label = status === "verified" ? "Verified" : status === "rejected" ? "Needs correction" : "Self-declared";
  return <span className="shrink-0 rounded-full border border-border bg-muted/25 px-2 py-1 text-[11px] font-medium text-muted-foreground">{label}</span>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 text-foreground">{value}</dd></div>;
}
