import Link from "next/link";
import { CalendarDays, ArrowUpRight, Newspaper } from "lucide-react";
import type { PublicDseNewsCard } from "@dse-pms/shared-types";
import styles from "./news.module.css";

export function readableDate(value:string):string {
  return new Intl.DateTimeFormat("en-GB", {dateStyle:"medium",timeZone:"Asia/Phnom_Penh"}).format(new Date(value));
}
export function PublicNewsCard({article}:{article:PublicDseNewsCard}) {
  return <article className={styles.card}>
    <Link href={"/program/news/"+article.id} className={styles.imageLink} aria-label={"Read "+article.title}>
      {article.cover
        ? <img src={article.cover.url} alt={article.cover.alt} loading="lazy"
            className={styles.cardImage} referrerPolicy="no-referrer"/>
        : <div className={styles.cardPlaceholder}><Newspaper aria-hidden="true"/></div>}
    </Link>
    <div className={styles.cardContent}>
      <p className={styles.cardDate}><CalendarDays aria-hidden="true"/>{readableDate(article.publishedAt)}</p>
      <h3><Link href={"/program/news/"+article.id}>{article.title}</Link></h3>
      <p className={styles.cardSummary}>{article.summary}</p>
      <div className={styles.tagList}>{article.tags.slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div>
      <Link className={styles.readLink} href={"/program/news/"+article.id}>Read story <ArrowUpRight aria-hidden="true"/></Link>
    </div>
  </article>;
}
