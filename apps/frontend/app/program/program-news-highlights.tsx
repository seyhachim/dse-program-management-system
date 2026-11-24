"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicDseNewsArticle } from "@dse-pms/shared-types";
import styles from "./program.module.css";
export function ProgrammeNewsHighlights(){
  const [articles,setArticles]=useState<PublicDseNewsArticle[]>([]);
  useEffect(()=>{
    let mounted=true;
    fetch("/api/programme/public/news",{credentials:"omit",cache:"no-store",signal:AbortSignal.timeout(5000)})
      .then(r=>r.ok?r.json():[])
      .then((v:PublicDseNewsArticle[])=>{if(mounted&&Array.isArray(v))setArticles(v.slice(0,3));})
      .catch(()=>{});
    return()=>{mounted=false;};
  },[]);
  return <section className={[styles.shell,styles.newsSection].join(" ")} id="news" aria-label="DSE News and Activities">
    <div className={styles.newsHeading}>
      <div><p className={styles.cardLabel}>From the DSE Community</p><h2>News & Activities</h2>
        <p>Field visits, student projects and hands-on learning stories.</p>
      </div>
      <Link className={styles.newsMore} href="/program/news">All news and activities →</Link>
    </div>
    {articles.length>0&&<div className={styles.newsGrid}>
      {articles.map(a=><article className={styles.newsCard} key={a.id}>
        <Link href={"/program/news/"+a.id} aria-label={"Read "+a.title}>
          {a.cover?<img alt={a.cover.alt} src={a.cover.url} className={styles.newsImage}/>
            :<div className={styles.newsPlaceholder}/>}
        </Link>
        <div className={styles.newsBody}><time dateTime={a.publicPublishedAt}>{new Date(a.publicPublishedAt).toLocaleDateString("en-GB",{dateStyle:"medium",timeZone:"UTC"})}</time>
          <Link className={styles.newsTitle} href={"/program/news/"+a.id}>{a.title}</Link>
          <p>{a.summary}</p></div>
      </article>)}
    </div>}
  </section>;
}
