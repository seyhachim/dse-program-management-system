"use client";
import { useCallback } from "react";
import Link from "next/link";
import { dseNewsApi } from "@/lib/activity-publications";
import { PortalError, PortalLoading, useCachedPortalData } from "../portal-state";

export function NewsStudentClient() {
  const load = useCallback(() => dseNewsApi.listPublished(), []);
  const { data, loading, error } = useCachedPortalData("dse-news", load);
  if (loading) return <PortalLoading />;
  if (error || !data) return <PortalError message={error ?? "Could not load programme news"} />;
  if (!data.length) return <p className="mx-auto max-w-4xl rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No approved news articles yet.</p>;
  return (
    <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
      {data.map(item => (
        <article key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card">
          {item.coverImageUrl && <img src={item.coverImageUrl} alt={item.coverAlt} loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full object-cover" />}
          <div className="space-y-3 p-5">
            <p className="text-xs text-muted-foreground">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ""} · {item.authorName}</p>
            <Link href={"/portal/news/" + item.id} className="text-lg font-semibold text-primary hover:underline">{item.title}</Link>
            <p className="text-sm text-muted-foreground">{item.summary}</p>
            <div className="flex flex-wrap gap-2">{item.tags.map(tag => <span key={tag} className="rounded bg-muted px-2 py-1 text-xs">{tag}</span>)}</div>
            <Link href={"/portal/news/" + item.id} className="inline-block text-sm font-medium text-primary underline">Read article</Link>
          </div>
        </article>
      ))}
    </div>
  );
}
