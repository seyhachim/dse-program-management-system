import type { PublicDseNewsArticle } from "@dse-pms/shared-types";
import { z } from "zod";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const photoSchema = z.object({ url: z.string(), alt: z.string() });
const articleSchema = z.object({
  id: z.string().regex(ID),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  publishedAt: z.string(),
  cover: photoSchema.nullable(),
  body: z.string(),
  gallery: z.array(photoSchema),
});
type FetchArticle = (url: string, init: RequestInit) => Promise<Response>;

/** Only a malformed route ID or an explicit upstream 404 means not found.
 * Transport failures, upstream errors and malformed responses must propagate.
 */
export async function fetchPublicNewsArticle(
  newsApi: string,
  id: string,
  request: FetchArticle = fetch,
): Promise<PublicDseNewsArticle | null> {
  if (!ID.test(id)) return null;
  const response = await request(newsApi + "/" + encodeURIComponent(id), {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Public DSE article temporarily unavailable (HTTP ${response.status})`);
  }
  return articleSchema.parse(await response.json());
}
