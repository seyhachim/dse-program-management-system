import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

test("public DSE website has an anonymous News page and latest news cards", async ({page}) => {
  await page.route("**/api/programme/public/programmes/dse/news", async route => {
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([
      {id:"11111111-2222-4333-8444-555555555555",
       title:"Synthetic Sindora Garden Visit",summary:"Regenerative farming and field learning",
       tags:["Field Visit"],publishedAt:"2026-11-24T09:30:00.000Z",cover:null},
    ])});
  });
  await page.goto("/program");
  await expect(page.getByRole("link",{name:"News & Activities"}).first()).toBeVisible();
  await expect(page.getByRole("heading",{name:"Synthetic Sindora Garden Visit"})).toBeVisible();
  await page.getByRole("link",{name:"Explore all news"}).click();
  await expect(page).toHaveURL(/\/program\/news$/);
  await expect(page.getByRole("heading",{name:"News & Activities"})).toBeVisible();
  await expect(page.getByRole("searchbox",{name:"Search DSE news"})).toBeVisible();
  await page.setViewportSize({width:375,height:820});
  const widths=await page.evaluate(()=>({view:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(widths.scroll).toBeLessThanOrEqual(widths.view+1);
});

test("coordinator must separately approve public publication after Student Published",async({browser})=>{
  const ctx=await newRoleContext(browser,"coordinator");
  try{
    const page=await ctx.newPage();
    let row:any={
      id:"11111111-2222-4333-8444-555555555555",
      programmeId:"dse",activityId:null,
      title:"Synthetic Sindora Approved Article",summary:"Students visit a pepper farm",
      body:"Synthetic visit explores responsible agricultural learning.",
      coverImageUrl:null,coverAlt:"",gallery:[],uploadedMedia:[],tags:["Field Visit"],
      mediaApproved:true,status:"Published",version:2,
      publicPublishedAt:null,authorName:"Synthetic Lecturer",
      publishedAt:"2026-11-24T09:30:00.000Z",createdAt:"2026-11-23T00:00:00.000Z",
      updatedAt:"2026-11-24T09:30:00.000Z",
    };
    await page.route("**/api/student-portal/news/manage**",async route=>{
      const req=route.request(),url=req.url();
      const reply=(body:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
      if(req.method()==="GET")return reply(url.endsWith("/manage")?[row]:row);
      if(req.method()==="POST"&&url.endsWith("/public-status")){
        const payload=req.postDataJSON();
        expect(payload.confirmPublicPermission).toBe(true);
        row={...row,version:3,publicPublishedAt:"2026-11-24T10:00:00.000Z"};
        return reply(row);
      }
      return route.fulfill({status:404,contentType:"application/json",body:'{"error":"Not found"}'});
    });
    await page.goto("/dse-news");
    await expect(page.getByRole("button",{name:"Approve for public website"})).toBeVisible();
    expect(await page.getByText("Public website: Not approved").count()).toBeGreaterThan(0);
    page.once("dialog",dialog=>dialog.accept());
    await page.getByRole("button",{name:"Approve for public website"}).click();
    await expect(page.getByRole("link",{name:"Open public website article"})).toBeVisible();
    await expect(page.getByText("Public website: Live")).toBeVisible();
    expect(row.publicPublishedAt).toBeTruthy();
  } finally { await ctx.close(); }
});
