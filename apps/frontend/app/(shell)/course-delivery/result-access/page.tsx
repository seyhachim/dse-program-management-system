"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import type { CourseDeliveryOffering } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { courseDeliveryApi } from "@/lib/course-delivery";

export default function ResultAccessSettingsPage() {
  const [offerings, setOfferings] = useState<CourseDeliveryOffering[]>([]);
  const [offeringId, setOfferingId] = useState("");
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void courseDeliveryApi.offerings()
      .then((rows) => {
        setOfferings(rows);
        setOfferingId(rows[0]?.offeringId ?? "");
      })
      .catch(() => setError("Could not load your course offerings."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!offeringId) return;
    setNotice(null);
    setError(null);
    void courseDeliveryApi.resultAccessPolicy(offeringId)
      .then((policy) => setRequired(policy.requireSurveyBeforeResults))
      .catch(() => setError("Could not load result access settings."));
  }, [offeringId]);

  const save = async () => {
    if (!offeringId) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await courseDeliveryApi.setResultAccessPolicy(offeringId, required);
      setNotice(required
        ? "Students must now complete the final anonymous survey before viewing provisional marks."
        : "Students can now view published provisional marks without completing the survey first.");
    } catch {
      setError("Could not save result access settings.");
    } finally {
      setSaving(false);
    }
  };

  const selected = offerings.find((item) => item.offeringId === offeringId);

  return (
    <main className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/course-delivery" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Course Delivery
        </Link>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <div className="flex gap-3">
            <span className="rounded-xl bg-primary/10 p-3 text-primary"><LockKeyhole className="h-5 w-5" /></span>
            <div>
              <h1 className="text-xl font-bold">Provisional result access</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose whether students must complete the final anonymous course survey before viewing published provisional marks in PMS.
              </p>
            </div>
          </div>

          {loading ? <p className="mt-6 text-sm text-muted-foreground">Loading…</p> : !offerings.length ? (
            <p className="mt-6 text-sm text-muted-foreground">No course offerings are assigned to you.</p>
          ) : (
            <div className="mt-6 space-y-5">
              <label className="block text-sm font-medium">
                Course section
                <select
                  value={offeringId}
                  onChange={(event) => setOfferingId(event.target.value)}
                  className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {offerings.map((offering) => (
                    <option key={offering.offeringId} value={offering.offeringId}>
                      {offering.code} · {offering.title} · Section {offering.sectionCode} · {offering.term}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-border p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(event) => setRequired(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-semibold">Require final survey before showing provisional marks</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      When enabled, students can still access course materials. Only published provisional marks, course grade, and score-derived CLO achievement are locked until their anonymous survey is submitted.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>This setting affects only provisional PMS visibility for {selected?.code ?? "this course"}. It does not change marks, official university submission, or survey anonymity.</p>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {notice ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save access setting"}</Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
