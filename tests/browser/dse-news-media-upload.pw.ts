import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

// Tiny synthetic source image. No real Sindora visitor photographs or student PII in CI.
const tinyPng=Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGO0rPFmgAEmBiSAmwMAMvIBCEh55VsAAAAASUVORK5CYII=",
  "base64",
);
test("private DSE News cover photo upload, preview and removal",async({browser})=>{
  const ctx=await newRoleContext(browser,"coordinator");
  try{
    const page=await ctx.newPage();
    let photoId="";
    let draft:any={
      id:"11111111-2222-4333-8444-555555555555",
      programmeId:"dse", activityId:null, authorName:"Synthetic Coordinator",
      title:"Synthetic News Story",summary:"Synthetic test article",body:"Synthetic news article about field learning.",
      coverImageUrl:null,coverAlt:"",gallery:[],uploadedMedia:[],tags:[],mediaApproved:false,
      status:"Draft",version:1,createdAt:"2026-11-24T00:00:00.000Z",
      updatedAt:"2026-11-24T00:00:00.000Z",publishedAt:null,
    };
    await page.route("**/api/student-portal/news/manage**",async route=>{
      const request=route.request(),method=request.method(),url=request.url();
      const reply=(status:number,body:unknown)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
      if(method==="GET"&&url.endsWith("/manage"))return reply(200,[draft]);
      if(method==="POST"&&url.includes("/media?")){
        const bytes=request.postDataBuffer()??Buffer.alloc(0);
        expect(request.headers()["content-type"]).toBe("application/octet-stream");
        expect(bytes.length).toBeGreaterThan(68);
        photoId="11111111-2222-4333-8444-777777777777";
        const kind=new URL(url).searchParams.get("kind");
        draft={...draft,version:2,mediaApproved:false,uploadedMedia:[{
          id:photoId,kind,alt:"Synthetic pepper vines",
          url:"https://example.invalid/private-main.webp",
          thumbnailUrl:"https://example.invalid/private-thumbnail.webp",
          width:1,height:1,bytes:bytes.length-8,
        }]};
        return reply(201,draft);
      }
      if(method==="DELETE"&&url.endsWith("/media/"+photoId)){
        draft={...draft,version:3,uploadedMedia:[],mediaApproved:false};
        return reply(200,draft);
      }
      return reply(404,{error:"Not found"});
    });
    await page.goto("/dse-news");
    await page.getByRole("button",{name:"Synthetic News Story"}).click();
    await page.getByLabel("Photo description (alt text)").fill("Synthetic pepper vines");
    await page.getByLabel("Upload cover photo").setInputFiles({
      name:"synthetic.png",mimeType:"image/png",buffer:tinyPng,
    });
    await expect(page.getByRole("button",{name:"Preview cover photo"})).toBeVisible();
    await page.getByRole("button",{name:"Preview cover photo"}).click();
    await expect(page.getByRole("dialog",{name:"Photo preview"})).toBeVisible();
    await page.getByRole("button",{name:"Close preview"}).click();
    page.once("dialog",dialog=>dialog.accept());
    await page.getByRole("button",{name:"Remove",exact:true}).click();
    await expect(page.getByLabel("Upload cover photo")).toBeAttached();
    expect(draft.uploadedMedia).toHaveLength(0);
    await page.setViewportSize({width:375,height:840});
    const w=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    expect(w.scroll).toBeLessThanOrEqual(w.width+1);
  }finally{await ctx.close();}
});
