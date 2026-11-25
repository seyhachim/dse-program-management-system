"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DseNewsView } from "@dse-pms/shared-types";
import { dseNewsApi } from "@/lib/activity-publications";

export function NewsArticleClient({ id, staffPreview = false }: { id: string; staffPreview?: boolean }) {
  const [article, setArticle] = useState<DseNewsView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (staffPreview ? dseNewsApi.getManaged(id) : dseNewsApi.getPublished(id))
      .then(value => { if (active) setArticle(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Article unavailable"); });
    return () => { active = false; };
  }, [id, staffPreview]);
  return (
    <article className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-border bg-card p-5 md:p-8">
      <Link href={staffPreview ? "/dse-news" : "/portal/news"} className="text-sm text-primary underline">← DSE News</Link>
      {staffPreview && <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">Staff preview · Only the published article is available to DSE students. Draft content and changes to the article are not public.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!error && !article && <p className="text-sm text-muted-foreground">Loading article…</p>}
      {article && (
        <>
          <h1 className="text-2xl font-semibold md:text-3xl">{article.title}</h1>
          <p className="text-sm text-muted-foreground">{article.summary}</p>
          <p className="text-xs text-muted-foreground">{article.authorName} · {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : ""}</p>
          {(article.uploadedMedia?.find(media=>media.kind==="cover")||article.coverImageUrl)&&(()=>{
            const uploaded=article.uploadedMedia?.find(media=>media.kind==="cover");
            return <img src={uploaded?.url??article.coverImageUrl??""} alt={uploaded?.alt??article.coverAlt}
              loading="lazy" referrerPolicy="no-referrer" className="max-h-[420px] w-full rounded-xl object-cover"/>;
          })()}
          <div className="whitespace-pre-wrap break-words text-sm leading-7">{article.body}</div>
          {(article.gallery.length > 0 || article.uploadedMedia?.some(media=>media.kind==="gallery")) && <div className="grid gap-3 sm:grid-cols-2">
            {(article.uploadedMedia??[]).filter(media=>media.kind==="gallery").map(img=><figure key={img.id}>
              <img src={img.url} alt={img.alt} loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full rounded-xl object-cover"/>
              <figcaption className="mt-1 text-xs text-muted-foreground">{img.alt}</figcaption>
            </figure>)}
            {article.gallery.map(img => <figure key={img.url}>
              <img src={img.url} alt={img.alt} loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full rounded-xl object-cover" />
              <figcaption className="mt-1 text-xs text-muted-foreground">{img.alt}</figcaption>
            </figure>)}
          </div>}
          <div className="flex flex-wrap gap-2">{article.tags.map(tag => <span key={tag} className="rounded bg-muted px-2 py-1 text-xs">{tag}</span>)}</div>
        </>
      )}
    </article>
  );
}
