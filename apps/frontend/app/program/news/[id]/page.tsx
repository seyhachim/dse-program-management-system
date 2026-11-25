import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicNewsArticle } from "@/lib/public-dse-news-server";
import { readableDate } from "../news-card";
import styles from "../news.module.css";

export const dynamic = "force-dynamic";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dse-pms.vercel.app";
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata> {
  const {id}=await params;
  const article=await loadPublicNewsArticle(id);
  if(!article) return {title:"Article not found | DSE",robots:{index:false,follow:false}};
  return {
    metadataBase:new URL(SITE),
    title:article.title+" | DSE · RUPP",
    description:article.summary,
    alternates:{canonical:"/program/news/"+id},
    openGraph:{
      type:"article",title:article.title,description:article.summary,
      url:"/program/news/"+id,publishedTime:article.publishedAt,
      images:[{url:"/rupp-logo.png",alt:"Royal University of Phnom Penh"}],
    },
    robots:{index:true,follow:true},
  };
}
export default async function PublicProgrammeNewsDetail({params}:{
  params:Promise<{id:string}>
}) {
  const {id}=await params;
  const article=await loadPublicNewsArticle(id);
  if(!article) notFound();
  const structured={
    "@context":"https://schema.org","@type":"NewsArticle",
    headline:article.title,description:article.summary,
    datePublished:article.publishedAt,
    mainEntityOfPage:SITE+"/program/news/"+id,
    publisher:{"@type":"CollegeOrUniversity",name:"Royal University of Phnom Penh"},
  };
  return <main className={styles.newsPage}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{
      __html:JSON.stringify(structured).replace(/</g,"\\u003c"),
    }}/>
    <header className={styles.header}><div className={styles.shell+" "+styles.nav}>
      <Link className={styles.brand} href="/program"><img src="/rupp-logo.png" alt="" />
        <span>DSE · Royal University of Phnom Penh</span></Link>
      <Link className={styles.topLink} href="/program/news">All news</Link>
    </div></header>
    <article className={styles.shell+" "+styles.detail}>
      <Link className={styles.back} href="/program/news">← Back to News & Activities</Link>
      <p className={styles.eyebrow}>DSE · {readableDate(article.publishedAt)}</p>
      <h1>{article.title}</h1>
      <p className={styles.deck}>{article.summary}</p>
      <div className={styles.tagList}>{article.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
      {article.cover&&<img className={styles.fullCover} src={article.cover.url} alt={article.cover.alt}
        referrerPolicy="no-referrer"/>}
      <div className={styles.articleBody}>{article.body}</div>
      {article.gallery.length>0&&<section aria-label="Visit photo gallery" className={styles.gallery}>
        {article.gallery.map((photo,i)=><figure key={i}>
          <img src={photo.url} alt={photo.alt} loading="lazy" referrerPolicy="no-referrer"/>
          <figcaption>{photo.alt}</figcaption>
        </figure>)}
      </section>}
      <div className={styles.more}><Link href="/program/news">Read more DSE stories</Link>
        <Link href="/program">About DSE</Link></div>
    </article>
    <footer className={styles.footer}><div className={styles.shell}>Data Science & Engineering · Faculty of Engineering · RUPP</div></footer>
  </main>;
}
