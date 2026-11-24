import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicNewsArticle } from "@/lib/public-dse-news-server";
import styles from "../news.module.css";
export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {id}=await params;
  const article=await publicNewsArticle(id);
  if(!article)return {title:"Article unavailable | DSE",robots:{index:false,follow:false}};
  return {title:article.title+" | DSE · RUPP",description:article.summary,
    openGraph:{title:article.title,description:article.summary,type:"article",
      publishedTime:article.publicPublishedAt,
      ...(article.cover?{images:[{url:article.cover.url,alt:article.cover.alt}]}:{})}};
}
export default async function PublicDseNewsArticlePage({params}:Props){
  const {id}=await params;
  const article=await publicNewsArticle(id);
  if(!article)notFound();
  return <main className={styles.page}>
    <header className={styles.header}><div className={[styles.shell,styles.top].join(" ")}>
      <Link className={styles.brand} href="/program">DSE · Royal University of Phnom Penh</Link>
      <Link className={styles.back} href="/program/news">← News & Activities</Link>
    </div></header>
    <article className={[styles.shell,styles.article].join(" ")}>
      <p className={styles.kicker}>DSE News & Activities</p>
      <h1 className={styles.title}>{article.title}</h1>
      <p className={styles.date}>Published {new Date(article.publicPublishedAt).toLocaleDateString("en-GB",{timeZone:"UTC",dateStyle:"long"})}</p>
      <p className={styles.subtitle}>{article.summary}</p>
      {article.cover&&<img className={styles.cover} alt={article.cover.alt} src={article.cover.url}/>}
      <div className={styles.content}>{article.body}</div>
      {article.gallery.length>0&&<div className={styles.gallery}>
        {article.gallery.map((photo,i)=><figure key={photo.url+"-"+i}>
          <img src={photo.url} alt={photo.alt} loading="lazy"/>
          <figcaption>{photo.alt}</figcaption>
        </figure>)}
      </div>}
      <div className={styles.tags}>{article.tags.map(tag=><span key={tag} className={styles.tag}>{tag}</span>)}</div>
    </article>
    <footer className={styles.footer}><div className={styles.shell}>Data Science and Engineering · Faculty of Engineering · RUPP</div></footer>
  </main>;
}
