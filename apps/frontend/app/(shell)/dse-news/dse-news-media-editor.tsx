"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import type { DseNewsUploadedMedia, DseNewsView } from "@dse-pms/shared-types";
import { dseNewsApi } from "@/lib/activity-publications";
import { compressNewsPhoto } from "@/lib/compress-news-photo";

const sizeLabel=(size:number)=>size<1024*1024?(size/1024).toFixed(0)+" KB":(size/(1024*1024)).toFixed(1)+" MB";

export function DseNewsMediaEditor({
  article,onChange,
}:{
  article:DseNewsView|null;
  onChange:(article:DseNewsView)=>void;
}){
  const [busy,setBusy]=useState<"cover"|"gallery"|"remove"|null>(null);
  const [description,setDescription]=useState("");
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const [preview,setPreview]=useState<DseNewsUploadedMedia|null>(null);

  const items=article?.uploadedMedia??[];
  const cover=items.find(m=>m.kind==="cover");
  const gallery=items.filter(m=>m.kind==="gallery");
  const canEdit=Boolean(article&&article.status==="Draft");
  async function upload(file:File|null,kind:"cover"|"gallery"){
    if(!file||!article||!canEdit)return;
    if(description.trim().length<3){
      setError("Describe the photo before uploading (at least 3 characters).");
      return;
    }
    if(kind==="gallery"&&gallery.length>=8){setError("Maximum eight gallery photos");return;}
    setBusy(kind);setStatus("Compressing photo in your browser…");setError("");
    try{
      const reduced=await compressNewsPhoto(file);
      setStatus("Uploading "+sizeLabel(reduced.compressedBytes)+" (original "+sizeLabel(reduced.originalBytes)+")…");
      const changed=await dseNewsApi.uploadMedia(article.id,kind,description,reduced.file);
      onChange(changed);setDescription("");
      setStatus("Photo saved privately. "+sizeLabel(reduced.originalBytes)+" → "+sizeLabel(reduced.compressedBytes)+". Review photo permissions again before publishing.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Photo upload failed");setStatus("");}
    finally{setBusy(null);}
  }
  function chosen(event:ChangeEvent<HTMLInputElement>,kind:"cover"|"gallery"){
    const file=event.target.files?.[0]??null;
    event.target.value="";
    void upload(file,kind);
  }
  function dropped(event:DragEvent<HTMLDivElement>,kind:"cover"|"gallery"){
    event.preventDefault();
    if(!canEdit||busy)return;
    void upload(event.dataTransfer.files[0]??null,kind);
  }
  async function remove(media:DseNewsUploadedMedia){
    if(!article||!canEdit||!window.confirm("Remove this photo from the article and private storage?"))return;
    setBusy("remove");setError("");setStatus("");
    try{
      const changed=await dseNewsApi.removeMedia(article.id,media.id);
      onChange(changed);setPreview(null);
      setStatus("Photo removed. Review photo permissions again before publishing.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not remove photo");}
    finally{setBusy(null);}
  }
  const box="relative flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center";
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label="Article photo manager">
      <div>
        <h3 className="font-semibold">Photos</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Select or drop a photo; WebP compression and a small thumbnail are created automatically.
          Files stay in private storage until an approved article is published to DSE students.
        </p>
      </div>
      {!article&&<p className="rounded-md bg-muted p-3 text-sm">Save the article draft before adding photos.</p>}
      {article&&article.status!=="Draft"&&<p className="rounded-md bg-muted p-3 text-sm">Unpublish this article before changing its photos.</p>}
      <label className="block space-y-1 text-sm">
        Photo description (alt text)
        <input className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={description} onChange={event=>setDescription(event.target.value)}
          maxLength={250} placeholder="Students observing pepper vines at Sindora Garden"
          disabled={!canEdit||Boolean(busy)}/>
      </label>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Cover photo</p>
        {cover?(
          <div className="relative overflow-hidden rounded-xl border border-border">
            <button type="button" onClick={()=>setPreview(cover)} className="block w-full" aria-label="Preview cover photo">
              <img src={cover.thumbnailUrl} alt={cover.alt} className="aspect-[16/9] max-h-60 w-full object-contain bg-muted/30"/>
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
              <span className="min-w-0 flex-1 text-muted-foreground">{cover.alt} · {sizeLabel(cover.bytes)}</span>
              {canEdit&&<button type="button" disabled={Boolean(busy)} className="rounded-md border border-border px-3 py-2 disabled:opacity-50" onClick={()=>void remove(cover)}>Remove</button>}
            </div>
          </div>
        ):(
          <div className={box} onDragOver={e=>e.preventDefault()} onDrop={e=>dropped(e,"cover")}>
            <span className="text-sm text-muted-foreground">Drag a cover photo here or select from your device</span>
            <label className="cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold">
              {busy==="cover"?"Uploading…":"Choose cover photo"}
              <input aria-label="Upload cover photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp"
                disabled={!canEdit||Boolean(busy)} onChange={event=>chosen(event,"cover")}/>
            </label>
          </div>
        )}
        {cover&&canEdit&&<label className="inline-block cursor-pointer rounded-md border border-border px-3 py-2 text-xs">
          Replace cover photo
          <input className="sr-only" aria-label="Replace cover photo" type="file" accept="image/jpeg,image/png,image/webp"
            disabled={Boolean(busy)} onChange={event=>chosen(event,"cover")}/>
        </label>}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold">Gallery</p><span className="text-xs text-muted-foreground">{gallery.length}/8 photos</span></div>
        {gallery.length>0&&<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {gallery.map(media=>(
            <div key={media.id} className="overflow-hidden rounded-lg border border-border">
              <button type="button" aria-label={"Preview "+media.alt} onClick={()=>setPreview(media)} className="block w-full">
                <img src={media.thumbnailUrl} alt={media.alt} className="aspect-square w-full object-cover"/>
              </button>
              <div className="space-y-1 p-2">
                <p className="line-clamp-2 text-xs">{media.alt}</p>
                {canEdit&&<button type="button" disabled={Boolean(busy)} onClick={()=>void remove(media)}
                  className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50">Remove</button>}
              </div>
            </div>
          ))}
        </div>}
        {gallery.length<8&&<div className={box} onDragOver={e=>e.preventDefault()} onDrop={e=>dropped(e,"gallery")}>
          <span className="text-sm text-muted-foreground">Add a gallery photo</span>
          <label className="cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold">
            {busy==="gallery"?"Uploading…":"Choose gallery photo"}
            <input aria-label="Upload gallery photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp"
              disabled={!canEdit||Boolean(busy)} onChange={event=>chosen(event,"gallery")}/>
          </label>
        </div>}
      </div>
      {status&&<p role="status" className="rounded-md bg-muted px-3 py-2 text-xs">{status}</p>}
      {error&&<p role="alert" className="rounded-md border border-destructive/50 px-3 py-2 text-xs text-destructive">{error}</p>}
      {preview&&<div role="dialog" aria-modal="true" aria-label="Photo preview" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm">{preview.alt}</p>
            <button type="button" autoFocus className="rounded-md border px-3 py-2 text-sm" onClick={()=>setPreview(null)}>Close preview</button>
          </div>
          <img src={preview.url} alt={preview.alt} className="max-h-[75vh] w-full object-contain"/>
        </div>
      </div>}
    </section>
  );
}
