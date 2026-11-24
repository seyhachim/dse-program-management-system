import { z } from "zod";
import type { PublicDseNewsArticle } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { signedNewsMediaUrl } from "../student-portal/dse-news-media-storage.ts";

/** Explicit allowlisted projection. Do not extend from DseNewsView (which contains staff metadata). */
async function projectPublicArticle(row: {
  id:string;title:string;summary:string;body:string;tags:unknown;gallery:unknown;
  coverImageUrl:string|null;coverAlt:string;publishedAt:Date|null;publicPublishedAt:Date|null;
}):Promise<PublicDseNewsArticle> {
  const photos=await prisma.dseNewsMedia.findMany({
    where:{articleId:row.id},select:{kind:true,storagePath:true,thumbnailPath:true,alt:true},
    orderBy:[{createdAt:"asc"},{id:"asc"}],
  });
  const uploadedCover=photos.find(p=>p.kind==="cover");
  const externalGallery=z.array(z.object({url:z.string().url(),alt:z.string()})).parse(row.gallery);
  return {
    id:row.id,title:row.title,summary:row.summary,body:row.body,
    tags:z.array(z.string()).parse(row.tags),
    publishedAt:row.publishedAt!.toISOString(),
    publicPublishedAt:row.publicPublishedAt!.toISOString(),
    cover:uploadedCover
      ?{url:await signedNewsMediaUrl(uploadedCover.thumbnailPath),alt:uploadedCover.alt}
      :row.coverImageUrl?{url:row.coverImageUrl,alt:row.coverAlt}:null,
    gallery:[
      ...await Promise.all(photos.filter(p=>p.kind==="gallery").map(async p=>({
        url:await signedNewsMediaUrl(p.storagePath),alt:p.alt,
      }))),
      ...externalGallery,
    ],
  };
}
const visible={programmeId:DEFAULT_PROGRAMME_ID,status:"Published",publicPublishedAt:{not:null}} as const;
export const publicDseNewsService={
  async list(){
    const rows=await prisma.dseNewsArticle.findMany({
      where:visible,
      select:{id:true,title:true,summary:true,body:true,tags:true,gallery:true,
        coverImageUrl:true,coverAlt:true,publishedAt:true,publicPublishedAt:true},
      orderBy:[{publicPublishedAt:"desc"},{id:"desc"}],take:50,
    });
    return Promise.all(rows.map(projectPublicArticle));
  },
  async get(id:string){
    const article=await prisma.dseNewsArticle.findFirst({
      where:{id,...visible},
      select:{id:true,title:true,summary:true,body:true,tags:true,gallery:true,
        coverImageUrl:true,coverAlt:true,publishedAt:true,publicPublishedAt:true},
    });
    if(!article)return null;
    return projectPublicArticle(article);
  },
};
