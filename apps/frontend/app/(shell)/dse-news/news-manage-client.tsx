"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CreateDseNewsInput, DseNewsView } from "@dse-pms/shared-types";
import { dseNewsApi } from "@/lib/activity-publications";
import { useMe } from "@/lib/auth";
import { DseNewsMediaEditor } from "./dse-news-media-editor";

const FIELD = "min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
type Draft = {
  title: string; summary: string; body: string; activityId: string;
  coverImageUrl: string; coverAlt: string; galleryText: string; tagsText: string;
  mediaApproved: boolean;
};
const EMPTY: Draft = {
  title: "", summary: "", body: "", activityId: "", coverImageUrl: "",
  coverAlt: "", galleryText: "", tagsText: "", mediaApproved: false,
};
function toInput(d: Draft): CreateDseNewsInput {
  return {
    title: d.title.trim(), summary: d.summary.trim(), body: d.body.trim(),
    activityId: d.activityId.trim() || null,
    coverImageUrl: d.coverImageUrl.trim() || null, coverAlt: d.coverAlt.trim(),
    gallery: d.galleryText.split(/\r?\n/).filter(Boolean).map((line) => {
      const [url = "", ...alt] = line.split("|");
      return { url: url.trim(), alt: alt.join("|").trim() };
    }),
    tags: d.tagsText.split(",").map(x => x.trim()).filter(Boolean),
    mediaApproved: d.mediaApproved,
  };
}
function fromView(v: DseNewsView): Draft {
  return {
    title: v.title, summary: v.summary, body: v.body, activityId: v.activityId ?? "",
    coverImageUrl: v.coverImageUrl ?? "", coverAlt: v.coverAlt,
    galleryText: v.gallery.map(m => m.url + " | " + m.alt).join("\n"),
    tagsText: v.tags.join(", "), mediaApproved: v.mediaApproved,
  };
}
export function NewsManageClient({ initialActivityId }: { initialActivityId: string }) {
  const { me } = useMe();
  const canPublish = me?.roles.some(r => ["admin", "program_coordinator", "program_secretary"].includes(r)) ?? false;
  const [news, setNews] = useState<DseNewsView[]>([]);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, activityId: initialActivityId });
  const [editing, setEditing] = useState<DseNewsView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try { setNews(await dseNewsApi.listManaged()); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load DSE News"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(old => ({ ...old, [key]: value })); }
  function select(item: DseNewsView) { setEditing(item); setDraft(fromView(item)); setError(""); setNotice(""); }
  function reset() { setEditing(null); setDraft({ ...EMPTY, activityId: initialActivityId }); setError(""); setNotice(""); }
  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const input = toInput(draft);
      const result = editing
        ? await dseNewsApi.edit(editing.id, { ...input, expectedVersion: editing.version })
        : await dseNewsApi.create(input);
      setEditing(result); setDraft(fromView(result));
      setNotice("Draft saved. Students cannot read it until approved and published.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save article"); }
    finally { setSaving(false); }
  }
  async function publicStatus(item: DseNewsView, action: "publish" | "unpublish") {
    if (action === "publish" && !window.confirm(
      "Make this article and its approved photos accessible to everyone without signing in? " +
      "Confirm the text, names, and every identifiable photo have permission for public website use.",
    )) return;
    if (action === "unpublish" && !window.confirm(
      "Remove this article from the public DSE website? DSE students can still see it.",
    )) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const changed = await dseNewsApi.changePublicStatus(item.id, {
        expectedVersion: item.version, action,
        confirmPublicPermission: action === "publish",
      });
      if (editing?.id === item.id) setEditing(changed);
      setNotice(action === "publish"
        ? "Article approved for the public DSE programme website."
        : "Article removed from the public website.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Public website approval failed");
    } finally { setSaving(false); }
  }
  async function status(item: DseNewsView, next: "Draft" | "Published" | "Archived") {
    if (next === "Published" && !window.confirm("Publish this article to all DSE students? Confirm photos and names have permission.")) return;
    if (next === "Archived" && !window.confirm("Archive this article?")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const changed = await dseNewsApi.changeStatus(item.id, { expectedVersion: item.version, status: next });
      if (editing?.id === item.id) setEditing(changed);
      setNotice("Article status: " + changed.status);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Publication failed"); }
    finally { setSaving(false); }
  }
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <p className="text-sm text-muted-foreground">Published articles appear to signed-in DSE students. Public website publishing is a second, explicit approval for everyone on the internet. Private participant records never appear in either article view.</p>
      {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{notice}</p>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Articles</h2>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={reset}>New draft</button>
          </div>
          {!news.length && <p className="text-sm text-muted-foreground">No programme news articles yet.</p>}
          {news.map(item => (
            <div key={item.id} className="space-y-2 border-t border-border pt-3">
              <button type="button" onClick={() => select(item)} className="text-left text-sm font-semibold text-primary hover:underline">{item.title}</button>
              <p className="text-xs text-muted-foreground">
                {item.status} · {item.publicPublishedAt ? "Public website: Live" : "Public website: Not approved"}
                {" · "}Revision {item.version} · {item.authorName}
              </p>
              <Link href={"/dse-news/view/" + item.id}
                className="inline-flex min-h-9 items-center rounded-md border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted">
                {item.status === "Published" ? "View published article" : "Preview draft"}
              </Link>
              {item.publicPublishedAt && (
                <Link href={"/program/news/" + item.id} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center rounded-md border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted">
                  Open public website article
                </Link>
              )}
              {canPublish && item.status !== "Archived" && (
                <div className="flex flex-wrap gap-2">
                  {item.status !== "Published"
                    ? <button disabled={saving} className="rounded border px-2 py-1 text-xs" onClick={() => { void status(item, "Published"); }}>Publish to DSE students</button>
                    : <button disabled={saving} className="rounded border px-2 py-1 text-xs" onClick={() => { void status(item, "Draft"); }}>Unpublish</button>}
                  <button disabled={saving} className="rounded border px-2 py-1 text-xs" onClick={() => { void status(item, "Archived"); }}>Archive</button>
                  {item.status === "Published" && (
                    item.publicPublishedAt
                      ? <button disabled={saving} className="rounded border px-2 py-1 text-xs"
                          onClick={() => { void publicStatus(item, "unpublish"); }}>Remove from public website</button>
                      : <button disabled={saving} className="rounded border border-primary/50 px-2 py-1 text-xs font-semibold text-primary"
                          onClick={() => { void publicStatus(item, "publish"); }}>Approve for public website</button>
                  )}

                </div>
              )}
            </div>
          ))}
        </section>
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="font-semibold">{editing ? "Edit " + editing.status.toLowerCase() + " article" : "Create article draft"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Plain text format prevents unsafe HTML. A coordinator reviews and publishes.</p>
          </div>
          <label className="block space-y-1 text-sm">Headline
            <input className={FIELD} maxLength={180} value={draft.title} onChange={e => change("title", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">Short summary
            <textarea className={FIELD} rows={2} maxLength={350} value={draft.summary} onChange={e => change("summary", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">Article text
            <textarea className={FIELD} rows={11} maxLength={12000} value={draft.body} onChange={e => change("body", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">Linked Course Activity ID (optional)
            <input className={FIELD} value={draft.activityId} onChange={e => change("activityId", e.target.value)} placeholder="Activity UUID" />
          </label>
          <label className="block space-y-1 text-sm">Tags, separated by commas
            <input className={FIELD} value={draft.tagsText} onChange={e => change("tagsText", e.target.value)} placeholder="Field Visit, Smart Agriculture" />
          </label>
          <DseNewsMediaEditor article={editing} onChange={(updated) => {
            setEditing(updated);
            setDraft(current => ({ ...current, mediaApproved: false }));
            setNotice("Photo changes saved. Review photo permissions before publishing.");
            void load();
          }} />
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Advanced: external image URLs</summary>
            <p className="mt-2 text-xs text-muted-foreground">Use direct photo upload above for new photos. Existing HTTPS image links remain supported.</p>
            <div className="mt-3 space-y-3">
          <label className="block space-y-1 text-sm">Approved HTTPS cover image URL (optional)
            <input className={FIELD} value={draft.coverImageUrl} onChange={e => change("coverImageUrl", e.target.value)} placeholder="https://..." />
          </label>
          <label className="block space-y-1 text-sm">Cover image description
            <input className={FIELD} value={draft.coverAlt} onChange={e => change("coverAlt", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">Gallery (one line: HTTPS URL | image description)
            <textarea className={FIELD} rows={3} value={draft.galleryText} onChange={e => change("galleryText", e.target.value)} />
          </label>
            </div>
          </details>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={draft.mediaApproved} onChange={e => change("mediaApproved", e.target.checked)} />
            I verified consent or permission for identifiable people in all included images.
          </label>
          {editing?.publicPublishedAt && (
            <p className="rounded-md border p-3 text-xs text-muted-foreground">
              This article is live on the public website. Remove public website access before editing its content.
            </p>
          )}
          <button type="button" disabled={saving || Boolean(editing?.status === "Archived") || Boolean(editing?.publicPublishedAt)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => { void save(); }}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create draft"}
          </button>
        </section>
      </div>
    </div>
  );
}
