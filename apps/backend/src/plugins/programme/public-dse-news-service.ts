import { type DseNewsArticle, type DseNewsMedia } from "@prisma/client";
import { z } from "zod";
import { NewsMediaSchema, type PublicDseNewsArticle, type PublicDseNewsCard } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { signedNewsMediaUrl } from "../student-portal/dse-news-media-storage.ts";

/** No authenticated student DTO is reused here. Only public-approved fields leave this module. */
export class PublicNewsNotFoundError extends Error {}
type Row = DseNewsArticle & { media: DseNewsMedia[] };

function safeGallery(row: Row) {
  if (!row.mediaApproved) return [];
  return NewsMediaSchema.array().parse(row.gallery);
}
function isPubliclyReadable(row: Row): boolean {
  if (row.status !== "Published" || !row.publicPublishedAt) return false;
  const hasPhotos = Boolean(row.coverImageUrl) || row.media.length > 0 ||
    NewsMediaSchema.array().parse(row.gallery).length > 0;
  return !hasPhotos || row.mediaApproved;
}
async function coverFor(row: Row, full: boolean): Promise<PublicDseNewsCard["cover"]> {
  const uploaded = row.media.find(media => media.kind === "cover");
  if (uploaded) return {
    url: await signedNewsMediaUrl(full ? uploaded.storagePath : uploaded.thumbnailPath),
    alt: uploaded.alt,
  };
  return row.coverImageUrl && row.mediaApproved
    ? { url: row.coverImageUrl, alt: row.coverAlt } : null;
}
async function toCard(row: Row, full = false): Promise<PublicDseNewsCard> {
  return {
    id: row.id, title: row.title, summary: row.summary,
    tags: z.array(z.string()).parse(row.tags),
    publishedAt: row.publicPublishedAt!.toISOString(),
    cover: await coverFor(row, full),
  };
}
export const publicDseNewsService = {
  async list(programmeId: string): Promise<PublicDseNewsCard[]> {
    if (programmeId !== DEFAULT_PROGRAMME_ID) return [];
    const rows = await prisma.dseNewsArticle.findMany({
      where: { programmeId, status: "Published", publicPublishedAt: { not: null } },
      include: { media: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      orderBy: [{ publicPublishedAt: "desc" }, { id: "desc" }],
      take: 40,
    });
    return Promise.all(rows.filter(isPubliclyReadable).map(row => toCard(row)));
  },
  async get(programmeId: string, id: string): Promise<PublicDseNewsArticle> {
    if (programmeId !== DEFAULT_PROGRAMME_ID) throw new PublicNewsNotFoundError("Article not found");
    const row = await prisma.dseNewsArticle.findFirst({
      where: { id, programmeId, status: "Published", publicPublishedAt: { not: null } },
      include: { media: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    if (!row || !isPubliclyReadable(row)) throw new PublicNewsNotFoundError("Article not found");
    const [card, uploaded] = await Promise.all([
      toCard(row, true),
      Promise.all(row.media.filter(media=>media.kind === "gallery")
        .map(async media => ({ url: await signedNewsMediaUrl(media.storagePath), alt: media.alt }))),
    ]);
    return {
      ...card,
      body: row.body,
      gallery: [...uploaded, ...safeGallery(row)],
    };
  },
};
