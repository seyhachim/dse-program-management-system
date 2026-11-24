import Link from "next/link";
import type { Metadata } from "next";
import { publicNewsList } from "@/lib/public-dse-news-server";
import styles from "./news.module.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"News & Activities | DSE · RUPP",
 description:"Approved news, field visits, learning activities and projects from Data Science and Engineering at RUPP."};
export default async function PublicNewsPage(){
  const articles=await publicNewsList();
  return <main className={styles.page}>
    <header className={styles.header}><div className={[styles.shell,styles.top].join(" ")}>
      <Link className={styles.brand} href="/program">DSE · Royal University of Phnom Penh</Link>
      <Link className={styles.back} href="/program">← Programme overview</Link>
    </div></header>
    <section className={[styles.shell,styles.hero].join(" ")}>
      <p className={styles.kicker}>DSE Programme</p>
      <h1 className={styles.title}>News & Activities</h1>
      <p className={styles.subtitle}>Field visits, student learning, academic events and stories from the Data Science and Engineering programme.</p>
    </section>
    <section className={[styles.shell,styles.cards].join(" ")} aria-label="Approved DSE news">
      {articles.map(a=><article key={a.id} className={styles.card}>
        <Link href={"/program/news/"+a.id} aria-label={"Read "+a.title}>
          {a.cover?<img src={a.cover.url} alt={a.cover.alt} className={styles.photo}/>:<div className={styles.placeholder}/>}
        </Link>
        <div className={styles.cardBody}>
          <p className={styles.date}>{new Date(a.publicPublishedAt).toLocaleDateString("en-GB",{timeZone:"UTC",dateStyle:"medium"})}</p>
          <Link className={styles.cardTitle} href={"/program/news/"+a.id}>{a.title}</Link>
          <p className={styles.subtitle}>{a.summary}</p>
          <div className={styles.tags}>{a.tags.map(tag=><span className={styles.tag} key={tag}>{tag}</span>)}</div>
        </div>
      </article>)}
      {!articles.length&&<p className={styles.empty}>No articles have been approved for the public website yet.</p>}
    </section>
    <footer className={styles.footer}><div className={styles.shell}>Data Science and Engineering · Faculty of Engineering · RUPP</div></footer>
  </main>;
}
