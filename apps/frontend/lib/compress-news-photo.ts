const MAX_SOURCE_BYTES=12*1024*1024;
const MAX_MAIN=2_621_440;
const MAX_THUMB=245_760;
const MIME=new Set(["image/jpeg","image/png","image/webp"]);

export type CompressedNewsPhoto={
  file:File;
  width:number;
  height:number;
  originalBytes:number;
  compressedBytes:number;
};

async function canvasWebp(canvas:HTMLCanvasElement, quality:number):Promise<Blob>{
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",quality));
  if(!blob||blob.type!=="image/webp")throw Error("This browser cannot encode WebP photos");
  return blob;
}
function scaledCanvas(bitmap:ImageBitmap,maxDimension:number){
  const ratio=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*ratio));
  const height=Math.max(1,Math.round(bitmap.height*ratio));
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("Image compression is unavailable in this browser");
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(bitmap,0,0,width,height);
  return canvas;
}
/** Canvas re-encoding removes camera EXIF and GPS metadata before upload. */
export async function compressNewsPhoto(file:File):Promise<CompressedNewsPhoto>{
  if(!MIME.has(file.type))throw Error("Select a JPG, PNG or WebP image");
  if(file.size===0||file.size>MAX_SOURCE_BYTES)throw Error("Original photo must be 12 MB or smaller");
  const bitmap=await createImageBitmap(file);
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>50_000_000){
      throw Error("Image dimensions are invalid or too large");
    }
    const mainCanvas=scaledCanvas(bitmap,1920);
    const thumbCanvas=scaledCanvas(bitmap,400);
    let main=await canvasWebp(mainCanvas,.8);
    if(main.size>MAX_MAIN)main=await canvasWebp(mainCanvas,.63);
    if(main.size>MAX_MAIN)main=await canvasWebp(mainCanvas,.48);
    let thumbnail=await canvasWebp(thumbCanvas,.7);
    if(thumbnail.size>MAX_THUMB)thumbnail=await canvasWebp(thumbCanvas,.45);
    if(main.size>MAX_MAIN||thumbnail.size>MAX_THUMB)throw Error("Photo is still too large after compression");
    const [mainBytes,thumbBytes]=await Promise.all([main.arrayBuffer(),thumbnail.arrayBuffer()]);
    const bytes=new Uint8Array(8+mainBytes.byteLength+thumbBytes.byteLength);
    const view=new DataView(bytes.buffer);
    view.setUint32(0,mainBytes.byteLength,true);
    view.setUint32(4,thumbBytes.byteLength,true);
    bytes.set(new Uint8Array(mainBytes),8);
    bytes.set(new Uint8Array(thumbBytes),8+mainBytes.byteLength);
    return {
      file:new File([bytes],"dse-news-photo.bin",{type:"application/octet-stream"}),
      width:mainCanvas.width,height:mainCanvas.height,
      originalBytes:file.size,compressedBytes:bytes.length,
    };
  }finally{bitmap.close();}
}
