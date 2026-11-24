import type { MetadataRoute } from "next";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://dse-pms.vercel.app").replace(/\/+$/,"");
export default function robots(): MetadataRoute.Robots {
  return {
    rules:[{
      userAgent:"*",
      allow:["/program","/program/news"],
      disallow:["/portal","/dse-news","/students","/offerings","/login","/api"],
    }],
    sitemap:SITE+"/sitemap.xml",
  };
}
