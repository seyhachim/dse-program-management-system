"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicDseNewsCard } from "@dse-pms/shared-types";
import { getPublicDseNewsInBrowser } from "@/lib/public-dse-news-browser";
import { PublicNewsCard } from "./news/news-card";
import styles from "./news/news.module.css";
import programStyles from "./program.module.css";

export function ProgrammeNewsTeaser() {
  const [items,setItems]=useState<PublicDseNewsCard[]>([]);
  useEffect(()=>{
    let active=true;
    getPublicDseNewsInBrowser().then(data=>{if(active)setItems(data.slice(0,3));})
      .catch(()=>{});
    return()=>{active=false;};
  },[]);
  return <section className={programStyles.shell+" "+styles.teaser} id="news"
    aria-labelledby="news-heading">
    <div className={styles.teaserHeading}>
      <div><p className={styles.eyebrow}>Learning in practice</p>
        <h2 id="news-heading">News & Activities</h2>
        <p>Field visits, student projects and collaborations from our programme.</p>
      </div>
      <Link href="/program/news" className={styles.topLink}>Explore all news</Link>
    </div>
    {items.length>0&&<div className={styles.grid}>
      {items.map(article=><PublicNewsCard key={article.id} article={article}/>)}
    </div>}
  </section>;
}
