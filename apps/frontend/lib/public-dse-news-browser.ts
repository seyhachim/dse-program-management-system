import type { PublicDseNewsCard } from "@dse-pms/shared-types";
export async function getPublicDseNewsInBrowser(): Promise<PublicDseNewsCard[]> {
  const result = await fetch("/api/programme/public/programmes/dse/news", {
    credentials:"omit",cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(5000),
  });
  if (!result.ok) throw new Error("Programme news is unavailable");
  return await result.json() as PublicDseNewsCard[];
}
