import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { dseNewsService, NewsConflictError, NewsNotFoundError } from "./dse-news-service.ts";
import {
  DSE_NEWS_BUCKET, NewsMediaError, MAX_PACKET_BYTES,
  newsMediaStorage, parseCompressedPhotoPack, validateMediaMetadata,
} from "./dse-news-media-storage.ts";

function referencedPaths(articleId:string, identifier:string) {
  return {original:articleId+"/"+identifier+".webp",thumbnail:articleId+"/"+identifier+"-thumb.webp"};
}
async function removePaths(paths:string[]) {
  if(!paths.length)return;
  try{
    const {error}=await newsMediaStorage().storage.from(DSE_NEWS_BUCKET).remove(paths);
    if(error)console.error("DSE News private photo storage cleanup failed",error.message);
  }catch(error){console.error("DSE News private photo cleanup failed",error);}
}

export const dseNewsMediaService={
  async upload(actor:AuthUser,articleId:string,packet:Uint8Array,kindValue:unknown,altValue:unknown){
    const article=await dseNewsService.assertMediaEditable(actor,articleId);
    const {kind,alt}=validateMediaMetadata(kindValue,altValue);
    if(packet.byteLength>MAX_PACKET_BYTES)throw new NewsMediaError(400,"Compressed upload exceeds the allowed limit");
    const {main,thumbnail,width,height}=parseCompressedPhotoPack(packet);
    const id=randomUUID(), paths=referencedPaths(articleId,id);
    const bucket=newsMediaStorage().storage.from(DSE_NEWS_BUCKET);
    const mainUpload=await bucket.upload(paths.original,main,{
      upsert:false,contentType:"image/webp",cacheControl:"900",
    });
    if(mainUpload.error)throw new NewsMediaError(502,"Private image upload failed; check the DSE News storage bucket");
    const thumbUpload=await bucket.upload(paths.thumbnail,thumbnail,{
      upsert:false,contentType:"image/webp",cacheControl:"900",
    });
    if(thumbUpload.error){
      await removePaths([paths.original]);
      throw new NewsMediaError(502,"Private thumbnail upload failed");
    }
    let oldCoverPaths:string[]=[];
    try{
      await prisma.$transaction(async tx=>{
        const changed=await tx.dseNewsArticle.updateMany({
          where:{id:articleId,version:article.version,status:"Draft"},
          data:{version:{increment:1},updatedById:actor.id,mediaApproved:false},
        });
        if(changed.count!==1)throw new NewsConflictError("Article changed while uploading; reload and retry");
        if(kind==="cover"){
          const old=await tx.dseNewsMedia.findMany({
            where:{articleId,kind:"cover"},select:{storagePath:true,thumbnailPath:true},
          });
          oldCoverPaths=old.flatMap(x=>[x.storagePath,x.thumbnailPath]);
          await tx.dseNewsMedia.deleteMany({where:{articleId,kind:"cover"}});
        }else{
          const count=await tx.dseNewsMedia.count({where:{articleId,kind:"gallery"}});
          if(count>=8)throw new NewsConflictError("Maximum eight gallery photos per story");
        }
        await tx.dseNewsMedia.create({
          data:{id,articleId,kind,alt,width,height,bytes:main.length,
            storagePath:paths.original,thumbnailPath:paths.thumbnail,uploadedById:actor.id},
        });
        await tx.dseNewsAuditEvent.create({
          data:{articleId,actorId:actor.id,action:"updated",
            before:{mediaChange:"upload",oldCoverCount:oldCoverPaths.length/2},
            after:{mediaChange:"upload",mediaId:id,kind,alt,width,height,bytes:main.length}},
        });
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    }catch(error){
      await removePaths([paths.original,paths.thumbnail]);
      throw error;
    }
    await removePaths(oldCoverPaths);
    return dseNewsService.staffGet(actor,articleId);
  },

  async remove(actor:AuthUser,articleId:string,mediaId:string){
    const article=await dseNewsService.assertMediaEditable(actor,articleId);
    const media=await prisma.dseNewsMedia.findFirst({where:{id:mediaId,articleId}});
    if(!media)throw new NewsNotFoundError("Photo not found in this article");
    await prisma.$transaction(async tx=>{
      const updated=await tx.dseNewsArticle.updateMany({
        where:{id:articleId,version:article.version,status:"Draft"},
        data:{version:{increment:1},mediaApproved:false,updatedById:actor.id},
      });
      if(!updated.count)throw new NewsConflictError("Article changed while removing a photo");
      const deletion=await tx.dseNewsMedia.deleteMany({where:{id:mediaId,articleId}});
      if(deletion.count!==1)throw new NewsConflictError("Photo changed while removing");
      await tx.dseNewsAuditEvent.create({
        data:{articleId,actorId:actor.id,action:"updated",
          before:{mediaChange:"remove",mediaId,kind:media.kind},
          after:{mediaChange:"removed",mediaId}},
      });
    });
    await removePaths([media.storagePath,media.thumbnailPath]);
    return dseNewsService.staffGet(actor,articleId);
  },
};
