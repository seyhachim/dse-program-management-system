import "server-only";
import type { PublicDseNewsArticle, PublicDseNewsCard } from "@dse-pms/shared-types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const NEWS_API = API_URL + "/api/programme/public/programmes/dse/news";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadPublicNews(): Promise<PublicDseNewsCard[]> {
  try {
    const response = await fetch(NEWS_API, { cache: "no-store", headers: {Accept:"application/json"}, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    return await response.json() as PublicDseNewsCard[];
  } catch { return []; }
}
export async function loadPublicNewsArticle(id: string): Promise<PublicDseNewsArticle | null> {
  if (!ID.test(id)) return null;
  try {
    const response = await fetch(NEWS_API + "/" + encodeURIComponent(id), {cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(5000)});
    if (!response.ok) return null;
    return await response.json() as PublicDseNewsArticle;
  } catch { return null; }
}
