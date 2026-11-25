import "server-only";
import { cache } from "react";
import type { PublicDseNewsCard } from "@dse-pms/shared-types";
import { fetchPublicNewsArticle } from "./public-dse-news-article";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const NEWS_API = API_URL + "/api/programme/public/programmes/dse/news";

export async function loadPublicNews(): Promise<PublicDseNewsCard[]> {
  try {
    const response = await fetch(NEWS_API, { cache: "no-store", headers: {Accept:"application/json"}, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    return await response.json() as PublicDseNewsCard[];
  } catch { return []; }
}

// Metadata and page share the same request-local article result (or error).
// Do not cache across requests: public approval can be withdrawn at any time.
export const loadPublicNewsArticle = cache((id: string) => fetchPublicNewsArticle(NEWS_API, id));
