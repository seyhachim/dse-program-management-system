import { describe, expect, test } from "bun:test";
import {
  NewsMediaError, dimensionsOfWebp, parseCompressedPhotoPack, validateMediaMetadata,
} from "./dse-news-media-storage.ts";

function extendedWebp(width:number,height:number,animated=false):Uint8Array {
  const data=new Uint8Array(30);
  data.set([82,73,70,70],0); // RIFF
  data.set([87,69,66,80],8); // WEBP
  data.set([86,80,56,88],12); // VP8X
  const view=new DataView(data.buffer);
  view.setUint32(4,data.length-8,true);
  view.setUint32(16,10,true);
  data[20]=animated?0x02:0;
  const w=width-1,h=height-1;
  data[24]=w&255;data[25]=(w>>8)&255;data[26]=(w>>16)&255;
  data[27]=h&255;data[28]=(h>>8)&255;data[29]=(h>>16)&255;
  return data;
}
function packet(main:Uint8Array,thumb:Uint8Array):Uint8Array {
  const data=new Uint8Array(8+main.length+thumb.length);
  new DataView(data.buffer).setUint32(0,main.length,true);
  new DataView(data.buffer).setUint32(4,thumb.length,true);
  data.set(main,8);
  data.set(thumb,8+main.length);
  return data;
}
describe("private DSE News photo upload validation",()=>{
  test("accepts valid compressed WebP and independent thumbnail",()=>{
    const original=extendedWebp(1920,1080),small=extendedWebp(400,225);
    const result=parseCompressedPhotoPack(packet(original,small));
    expect(result.width).toBe(1920);expect(result.height).toBe(1080);
    expect(result.main.length).toBe(30);
  });
  test("rejects forged payload, animated media and oversized dimensions",()=>{
    const cover=extendedWebp(800,600),thumb=extendedWebp(200,150);
    const damaged=extendedWebp(800,600);damaged[8]=0;
    expect(()=>dimensionsOfWebp(damaged)).toThrow(NewsMediaError);
    expect(()=>dimensionsOfWebp(extendedWebp(800,600,true))).toThrow("Animated");
    expect(()=>parseCompressedPhotoPack(packet(extendedWebp(2100,1100),thumb))).toThrow("dimensions");
    expect(()=>parseCompressedPhotoPack(packet(cover,extendedWebp(600,500)))).toThrow("dimensions");
    expect(()=>parseCompressedPhotoPack(packet(cover,thumb).slice(0,-2))).toThrow(NewsMediaError);
  });
  test("supports cover/gallery only with descriptive alt text",()=>{
    expect(validateMediaMetadata("cover","Pepper vines at farm")).toEqual({kind:"cover",alt:"Pepper vines at farm"});
    expect(()=>validateMediaMetadata("gallery","  ")).toThrow();
    expect(()=>validateMediaMetadata("attachment","Photo")).toThrow();
    expect(()=>validateMediaMetadata("gallery","x".repeat(260))).toThrow();
  });
});
