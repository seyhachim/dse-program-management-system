import type { MetadataRoute } from "next";
import { loadPublicNews } from "@/lib/public-dse-news-server";
export const dynamic = "force-dynamic";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://dse-pms.vercel.app").replace(/\/+$/,"");
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories = await loadPublicNews();
  return [
    {url:SITE+"/program",changeFrequency:"weekly",priority:1},
    {url:SITE+"/program/news",changeFrequency:"daily",priority:0.8},
    ...stories.map(article=>({
      url:SITE+"/program/news/"+article.id,
      lastModified:new Date(article.publishedAt),changeFrequency:"monthly" as const,priority:0.7,
    })),
  ];
}
