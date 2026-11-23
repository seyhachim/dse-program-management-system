"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type {
  CreateOfferingActivityInput,
  OfferingActivityStatus,
  OfferingActivityType,
  OfferingActivityView,
} from "@dse-pms/shared-types";
import { offeringActivitiesApi } from "@/lib/offering-activities";

const TYPES: Array<{ value: OfferingActivityType; label: string }> = [
  { value: "field_visit", label: "Field Visit" },
  { value: "industry_visit", label: "Industry Visit" },
  { value: "workshop", label: "Workshop" },
  { value: "guest_lecture", label: "Guest Lecture" },
  { value: "other", label: "Other" },
];
type Draft = {
  type: OfferingActivityType;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  host: string;
  location: string;
  description: string;
  objectives: string;
  reflectionPrompt: string;
  evidenceUrls: string;
  status: "Draft" | "Published";
};
const EMPTY: Draft = {
  type: "field_visit", title: "", date: "", startTime: "", endTime: "",
  host: "", location: "", description: "", objectives: "", reflectionPrompt: "",
  evidenceUrls: "", status: "Draft",
};
const inputClass = "w-full min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm";
const actionClass = "rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";

function toDraft(activity: OfferingActivityView): Draft {
  return {
    type: activity.type,
    title: activity.title,
    date: activity.date,
    startTime: activity.startTime ?? "",
    endTime: activity.endTime ?? "",
    host: activity.host,
    location: activity.location,
    description: activity.description,
    objectives: activity.objectives,
    reflectionPrompt: activity.reflectionPrompt,
    evidenceUrls: activity.evidenceLinks.map((link) => link.url).join("\n"),
    status: activity.status === "Published" ? "Published" : "Draft",
  };
}
function typeLabel(type: OfferingActivityType): string {
  return TYPES.find((item) => item.value === type)?.label ?? "Activity";
}
function evidenceInput(text: string) {
  return text.split(/\r?\n/).map((url) => url.trim()).filter(Boolean)
    .map((url) => ({ kind: "other" as const, label: "Evidence link", url }));
}

export function ActivitiesClient({ offeringId }: { offeringId: string }) {
  const [items, setItems] = useState<OfferingActivityView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState<Draft>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await offeringActivitiesApi.list(offeringId));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load course activities");
    } finally {
      setLoading(false);
    }
  }, [offeringId]);

  useEffect(() => { void load(); }, [load]);

  const change = (name: keyof Draft, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
  };
  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
    setEditingVersion(null);
    setOpenForm(false);
  };
  const beginNew = () => {
    setError("");
    setMessage("");
    setForm(EMPTY);
    setEditingId(null);
    setEditingVersion(null);
    setOpenForm(true);
  };
  const beginEdit = (item: OfferingActivityView) => {
    setError("");
    setMessage("");
    setForm(toDraft(item));
    setEditingId(item.id);
    setEditingVersion(item.version);
    setOpenForm(true);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const input: CreateOfferingActivityInput = {
      type: form.type, title: form.title, date: form.date,
      startTime: form.startTime || null, endTime: form.endTime || null,
      host: form.host, location: form.location, description: form.description,
      objectives: form.objectives, reflectionPrompt: form.reflectionPrompt,
      evidenceLinks: evidenceInput(form.evidenceUrls), status: form.status,
    };
    try {
      if (editingId && editingVersion !== null) {
        await offeringActivitiesApi.update(offeringId, editingId, { ...input, expectedVersion: editingVersion });
        setMessage("Activity updated.");
      } else {
        await offeringActivitiesApi.create(offeringId, input);
        setMessage("Activity created.");
      }
      reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save course activity");
    } finally {
      setSaving(false);
    }
  }

  async function archive(item: OfferingActivityView) {
    if (!window.confirm("Archive this activity? The record and audit history will be kept.")) return;
    setError("");
    try {
      await offeringActivitiesApi.update(offeringId, item.id, {
        expectedVersion: item.version, status: "Archived",
      });
      setMessage("Activity archived. Historical evidence is preserved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not archive activity");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm text-muted-foreground underline-offset-2 hover:underline" href="/offerings">
          ← Course Offerings
        </Link>
        <button type="button" onClick={beginNew} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Add Activity
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Activities belong to this specific course offering, not the whole course catalog.
        Evidence is private to authorized teaching staff in this MVP. Attendance and student portfolios remain separate records.
      </p>
      {message ? <p role="status" className="rounded-md border border-border bg-muted/30 p-3 text-sm">{message}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}

      {openForm ? (
        <form onSubmit={(event) => { void submit(event); }} className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{editingId ? "Edit activity" : "New course activity"}</h2>
            <button type="button" onClick={reset} className={actionClass} disabled={saving}>Cancel</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Type
              <select className={inputClass} value={form.type} onChange={(e) => change("type", e.target.value)}>
                {TYPES.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">Date
              <input required type="date" className={inputClass} value={form.date} onChange={(e) => change("date", e.target.value)} />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">Title
              <input required maxLength={160} className={inputClass} value={form.title} onChange={(e) => change("title", e.target.value)} placeholder="Sindora Garden Field Visit" />
            </label>
            <label className="space-y-1 text-sm">Host / organization
              <input required maxLength={160} className={inputClass} value={form.host} onChange={(e) => change("host", e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">Location
              <input maxLength={240} className={inputClass} value={form.location} onChange={(e) => change("location", e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">Start time (optional)
              <input type="time" className={inputClass} value={form.startTime} onChange={(e) => change("startTime", e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">End time (optional)
              <input type="time" className={inputClass} value={form.endTime} onChange={(e) => change("endTime", e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1 text-sm">Learning objectives
            <textarea rows={3} maxLength={2000} className={inputClass} value={form.objectives} onChange={(e) => change("objectives", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">Description / observations
            <textarea rows={3} maxLength={2000} className={inputClass} value={form.description} onChange={(e) => change("description", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">Student reflection prompt
            <textarea rows={2} maxLength={1200} className={inputClass} value={form.reflectionPrompt} onChange={(e) => change("reflectionPrompt", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">Evidence links (one HTTPS URL per line)
            <textarea rows={3} className={inputClass} value={form.evidenceUrls} onChange={(e) => change("evidenceUrls", e.target.value)} placeholder="https://drive.google.com/..." />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">Status
              <select className={inputClass} value={form.status} onChange={(e) => change("status", e.target.value)}>
                <option value="Draft">Draft</option>
                <option value="Published">Published (staff record)</option>
              </select>
            </label>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? "Saving..." : editingId ? "Save changes" : "Create activity"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="space-y-3" aria-label="Course activity records">
        {loading ? <p className="text-sm text-muted-foreground">Loading activities…</p> : null}
        {!loading && items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No recorded activities yet. Add a field visit, workshop, or guest lecture to preserve teaching evidence.
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className="space-y-3 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {typeLabel(item.type)} · {item.date} {item.startTime ? "· " + item.startTime : ""}
                  {item.endTime ? "–" + item.endTime : ""}
                </p>
                <h3 className="mt-1 text-base font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {item.host}{item.location ? " · " + item.location : ""}
                </p>
              </div>
              <span className="rounded-md border border-border px-2 py-1 text-xs">{item.status}</span>
            </div>
            {item.objectives ? <p className="whitespace-pre-wrap text-sm"><strong>Objectives:</strong> {item.objectives}</p> : null}
            {item.description ? <p className="whitespace-pre-wrap text-sm">{item.description}</p> : null}
            {item.reflectionPrompt ? <p className="whitespace-pre-wrap text-sm"><strong>Reflection:</strong> {item.reflectionPrompt}</p> : null}
            {item.evidenceLinks.length > 0 ? (
              <div className="flex flex-wrap gap-3 text-sm">
                {item.evidenceLinks.map((link, index) => (
                  <a key={item.id + index} href={link.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    {link.label} {index + 1}
                  </a>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {item.status !== "Archived" ? (
                <>
                  <button type="button" className={actionClass} onClick={() => beginEdit(item)}>Edit</button>
                  <button type="button" className={actionClass} onClick={() => { void archive(item); }}>Archive</button>
                </>
              ) : <span className="text-xs text-muted-foreground">Archived records are preserved for audit.</span>}
              <span className="ml-auto self-center text-xs text-muted-foreground">Revision {item.version}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
