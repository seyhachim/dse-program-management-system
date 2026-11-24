import { expect, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

test.describe("Sindora participation and DSE News UI", () => {
  test("lecturer can record trip checkpoints without certifying farm attendance by default", async ({ browser }) => {
    const ctx = await newRoleContext(browser, "lecturer");
    try {
      const page = await ctx.newPage();
      const offeringId = "synthetic-news-ui";
      const activityId = "synthetic-visit";
      const studentId = "11111111-2222-4333-8444-555555555555";
      let recorded: any[] = [];
      await page.route("**/api/offerings/" + offeringId + "/activities/" + activityId + "/participants**", async route => {
        const req = route.request();
        const method = req.method();
        const input = method === "GET" ? null : req.postDataJSON();
        const reply = (status:number, body:unknown) => route.fulfill({
          status, contentType: "application/json", body: JSON.stringify(body),
        });
        if (method === "GET") return reply(200,{
          roster:[{id:studentId,name:"Synthetic Student",studentNumber:null}],
          participants:recorded,
        });
        if(method === "POST") {
          recorded=[{
            id:"synthetic-participant",activityId,studentId,
            studentName:"Synthetic Student",externalName:null,externalRole:null,
            goStatus:input.goStatus,returnStatus:input.returnStatus,
            farmStatus:"Unverified",source:input.source,note:"",version:1,
            createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
          }];
          return reply(201,recorded[0]);
        }
        if(method === "PATCH") {
          if(input.expectedVersion!==recorded[0]?.version) return reply(409,{error:"Version conflict"});
          recorded=[{...recorded[0],...input,version:recorded[0].version+1}];
          return reply(200,recorded[0]);
        }
        return reply(404,{error:"Not found"});
      });
      await page.goto("/course-delivery/activities/" + offeringId + "/participants?activityId=" + activityId);
      await expect(page.getByText("Not documented on this sheet")).toBeVisible();
      await page.getByLabel("Student from AIE401 roster").selectOption(studentId);
      await page.getByLabel("Departure / Go").selectOption("Marked");
      await page.getByRole("combobox", { name: "Return", exact: true }).selectOption("Marked", { timeout: 10000 });
      await page.getByRole("button",{name:"Save trip participant"}).click();
      await expect(page.getByText("Farm attendance remains unverified.",{exact:false})).toBeVisible();
      expect(recorded[0].farmStatus).toBe("Unverified");
      await page.setViewportSize({width:375,height:850});
      const width=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
      expect(width.content).toBeLessThanOrEqual(width.viewport+1);
    } finally { await ctx.close().catch(() => {}); }
  });
  test("coordinator publishes draft and student sees a programme article without private roster", async ({ browser }) => {
    const ctx = await newRoleContext(browser,"coordinator");
    let articles:any[] = [];
    try {
      const page=await ctx.newPage();
      await page.route("**/api/student-portal/news/manage**", async route => {
        const req=route.request(),method=req.method(),input=method==="GET"?null:req.postDataJSON();
        const reply=(status:number,body:unknown)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
        if(method==="GET") return reply(200,articles);
        if(method==="POST"&&!req.url().includes("/status")){
          const record={...input,id:"article-pilot",programmeId:"dse",authorName:"Coordinator",status:"Draft",version:1,publishedAt:null,
            createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
          articles=[record];return reply(201,record);
        }
        if(method==="POST"&&req.url().includes("/status")){
          articles=[{...articles[0],status:input.status,version:2,publishedAt:new Date().toISOString()}];
          return reply(200,articles[0]);
        }
        return reply(404,{error:"Not found"});
      });
      await page.goto("/dse-news");
      await expect(page.getByText("Create article draft")).toBeVisible();
      await page.getByLabel("Headline").fill("DSE Students Visit Sindora Garden");
      await page.getByLabel("Short summary").fill("Students learned about regenerative pepper farming.");
      await page.getByLabel("Article text").fill("Students explored agricultural sustainability and learned why simple, maintainable technologies can be more appropriate for farmers than complicated automation. They discussed evidence and data needs with the farm team.");
      await page.getByRole("button",{name:"Create draft"}).click();
      await expect(page.getByText("Draft saved.",{exact:false})).toBeVisible();
      page.once("dialog",dialog=>dialog.accept());
      await page.getByRole("button",{name:"Publish to DSE students"}).click();
      await expect(page.getByText("Article status: Published")).toBeVisible();
    } finally { await ctx.close().catch(() => {}); }
    const studentCtx=await newRoleContext(browser,"student");
    try {
      const page=await studentCtx.newPage();
      await page.route("**/api/student-portal/news**",async route=>{
        const id=route.request().url().endsWith("/article-pilot");
        await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(id?articles[0]:articles)});
      });
      await page.goto("/portal/news");
      await expect(page.getByText("DSE Students Visit Sindora Garden")).toBeVisible();
      await page.getByRole("link",{name:"Read article"}).click();
      await expect(page.getByText("Students explored agricultural sustainability",{exact:false})).toBeVisible();
      await expect(page.getByText("Marked")).toHaveCount(0);
    } finally { await studentCtx.close(); }
  });
});
