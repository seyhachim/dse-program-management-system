import Link from "next/link";
import { type Metadata } from "next";
import { PublicNewsCard } from "./news-card";
import { loadPublicNews } from "@/lib/public-dse-news-server";
import styles from "./news.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://dse-pms.vercel.app"),
  title:"DSE News & Activities | Royal University of Phnom Penh",
  description:"Field visits, student activities and practical learning stories from the Data Science and Engineering programme at RUPP.",
  alternates:{canonical:"/program/news"},
  openGraph:{title:"DSE News & Activities",type:"website",url:"/program/news"},
};

export default async function PublicProgrammeNewsPage({searchParams}:{
  searchParams:Promise<{q?:string}>
}) {
  const [stories,query] = await Promise.all([loadPublicNews(),searchParams]);
  const q=(query.q??"").trim().slice(0,90);
  const shown=q ? stories.filter(item=>
    [item.title,item.summary,...item.tags].join(" ").toLocaleLowerCase().includes(q.toLocaleLowerCase())
  ) : stories;
  return (
    <main className={styles.newsPage}>
      <header className={styles.header}><div className={styles.shell+" "+styles.nav}>
        <Link className={styles.brand} href="/program"><img src="/rupp-logo.png" alt="" />
          <span>DSE · Royal University of Phnom Penh</span></Link>
        <Link className={styles.topLink} href="/program">Programme home</Link>
      </div></header>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>DSE Programme · Learning beyond the classroom</p>
          <h1>News & Activities</h1>
          <p>Discover field visits, student experiences and collaborations from the Data Science and Engineering programme.</p>
          <form className={styles.searchForm} method="get" action="/program/news" role="search">
            <input aria-label="Search DSE news" name="q" type="search" defaultValue={q}
              placeholder="Search visits, activities, topics…" maxLength={90} />
            <button type="submit">Search</button>
          </form>
        </section>
        {shown.length
          ? <div className={styles.grid}>{shown.map(article=><PublicNewsCard key={article.id} article={article}/>)}</div>
          : <div className={styles.empty}>{q
              ? "No public news articles match this search."
              : "Programme articles will appear here once approved for public publication."}</div>}
        {q && <p className={styles.more}><Link href="/program/news">Clear search</Link></p>}
      </div>
      <footer className={styles.footer}><div className={styles.shell}>Data Science & Engineering · Faculty of Engineering · RUPP</div></footer>
    </main>
  );
}
