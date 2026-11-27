import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, request, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { DEV_TOKEN_STORAGE_KEY, newRoleContext } from "./auth.ts";

type Actor = {name:string; email:string; token:string; enrollmentId:string};
type Fixture = {offeringId:string;otherOfferingId:string;assessmentId:string;a:Actor;b:Actor;outsider:Actor};
const root = fileURLToPath(new URL("../../", import.meta.url));
async function actorContext(browser: Browser, actor: Actor, mobile = false) {
  const context = await browser.newContext({viewport:mobile?{width:320,height:800}:{width:1280,height:900}});
  await context.addInitScript(({key,value}) => localStorage.setItem(key,value),
    {key:DEV_TOKEN_STORAGE_KEY,value:actor.token});
  return context;
}
async function openGroups(page: Page, offeringId: string) {
  await page.goto("/portal/courses/" + offeringId);
  await page.getByRole("tab",{name:"Project Groups",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Project groups",exact:true})).toBeVisible();
}

test("#1352 real lecturer and two-student project-group consent, return, approval and mobile acceptance", async ({browser}) => {
  test.setTimeout(180_000);
  // The fixture uses only the fresh local browser DB, and refuses any hosted DB.
  // Read the synthetic JWTs privately from subprocess output; never print them.
  const output=execFileSync("bun",["run","apps/backend/scripts/seed-project-groups-browser.ts"],{cwd:root,encoding:"utf8",
    env:{...process.env,AUTH_MODE:"dev"},stdio:["ignore","pipe","pipe"]});
  const f=JSON.parse(output.trim().split("\n").at(-1)!) as Fixture;
  const contexts:BrowserContext[]=[];
  const lecturer=await newRoleContext(browser,"lecturer");contexts.push(lecturer);
  const a=await actorContext(browser,f.a);contexts.push(a);
  const b=await actorContext(browser,f.b,true);contexts.push(b);
  const api=await request.newContext({baseURL:"http://127.0.0.1:4000",extraHTTPHeaders:{Authorization:"Bearer "+f.a.token}});
  const other=await request.newContext({baseURL:"http://127.0.0.1:4000",extraHTTPHeaders:{Authorization:"Bearer "+f.outsider.token}});
  const staffApi=await request.newContext({baseURL:"http://127.0.0.1:4000",extraHTTPHeaders:{Authorization:"Bearer "+process.env.BROWSER_SMOKE_LECTURER_TOKEN}});
  const anon=await request.newContext({baseURL:"http://127.0.0.1:4000"});
  const path="/api/student-portal/courses/"+f.offeringId+"/assessments/"+f.assessmentId+"/project-groups";
  const manage="/api/student-portal/manage/offerings/"+f.offeringId+"/assessments/"+f.assessmentId+"/project-groups";
  try {
    expect((await anon.get(path)).status()).toBe(401);
    expect((await other.get(path)).status()).toBe(403);
    expect((await api.get(manage)).status()).toBe(403);
    const lp=await lecturer.newPage();
    const ap=await a.newPage();
    const bp=await b.newPage();
    await lp.goto("/course-delivery");
    await lp.getByLabel("Course section").selectOption(f.offeringId);
    await lp.getByRole("tab",{name:"Results",exact:true}).click();
    await expect(lp.getByRole("heading",{name:"Student group registration",exact:true})).toBeVisible();
    await openGroups(ap,f.offeringId);
    await expect(ap.getByText("Registration is closed",{exact:true})).toBeVisible();
    await lp.getByLabel("Enable student registration").check();
    await lp.getByLabel("Maximum groups").fill("2");
    await lp.getByLabel("Minimum members").fill("2");
    await lp.getByLabel("Maximum members").fill("3");
    const deadline=new Date(Date.now()+86400000+7*3600000).toISOString().slice(0,16);
    await lp.getByLabel("Deadline (Cambodia time)").fill(deadline);
    await lp.getByRole("button",{name:"Save registration settings"}).click();
    await expect(lp.getByText(/Registration open · 0 official groups/)).toBeVisible();
    await ap.getByRole("button",{name:"Refresh project groups",exact:true}).click();
    await expect(ap.getByText("Registration open",{exact:true})).toBeVisible();
    await ap.getByLabel("Group name",{exact:true}).fill("Rainfall Forecasting");
    await ap.getByRole("button",{name:"Create group",exact:true}).click();
    await expect(ap.getByText("Draft group · 1 accepted",{exact:true})).toBeVisible();
    const own=await (await api.get(path)).json();
    const proposalId=own.proposals[0].id as string;
    const invalid=await api.post(path,{data:{action:"invite",proposalId,enrollmentId:f.outsider.enrollmentId}});
    expect(invalid.status()).toBe(409);
    await expect(ap.getByLabel("Classmate to invite").locator("option").filter({hasText:f.outsider.name})).toHaveCount(0);
    await ap.getByLabel("Classmate to invite").selectOption(f.b.enrollmentId);
    await ap.getByRole("button",{name:"Invite classmate"}).click();
    await expect(ap.getByRole("button",{name:"Revoke",exact:true})).toBeVisible();
    await expect(ap.getByRole("button",{name:"Submit for approval"})).toBeDisabled();
    await openGroups(bp,f.offeringId);
    await expect(bp.getByRole("heading",{name:"Invitations",exact:true})).toBeVisible();
    await expect(bp.getByText("Invited by "+f.a.name,{exact:true})).toBeVisible();
    const mobile=await bp.getByRole("button",{name:"Accept",exact:true}).boundingBox();
    expect(mobile).not.toBeNull();
    expect(mobile!.x).toBeGreaterThanOrEqual(0);
    expect(mobile!.x+mobile!.width).toBeLessThanOrEqual(321);
    await bp.getByRole("button",{name:"Accept",exact:true}).focus();
    await bp.keyboard.press("Enter");
    await expect(bp.getByText("Draft group · 2 accepted",{exact:true})).toBeVisible();
    await ap.getByRole("button",{name:"Refresh project groups",exact:true}).click();
    await expect(ap.getByRole("button",{name:"Submit for approval"})).toBeEnabled();
    await ap.getByRole("button",{name:"Submit for approval"}).click();
    await expect(ap.getByText(/Awaiting lecturer approval/)).toBeVisible();
    expect((await (await staffApi.get(manage)).json()).officialGroupCount).toBe(0);
    await lp.getByRole("button",{name:"Refresh student group registration",exact:true}).click();
    await lp.getByLabel("Reason (return or cancel)").fill("Clarify the forecasting topic.");
    await lp.getByRole("button",{name:"Return for changes"}).click();
    await expect(lp.getByText("Feedback: Clarify the forecasting topic.",{exact:true})).toBeVisible();
    await ap.getByRole("button",{name:"Refresh project groups",exact:true}).click();
    await expect(ap.getByText("Lecturer feedback: Clarify the forecasting topic.",{exact:true})).toBeVisible();
    await ap.getByRole("button",{name:"Submit for approval"}).click();
    await expect(ap.getByText(/Awaiting lecturer approval/)).toBeVisible();
    await lp.getByRole("button",{name:"Refresh student group registration",exact:true}).click();
    lp.once("dialog",dialog=>dialog.accept());
    await lp.getByRole("button",{name:"Approve group",exact:true}).click();
    await expect(lp.getByText(/1 official groups/)).toBeVisible();
    await bp.getByRole("button",{name:"Refresh project groups",exact:true}).click();
    await expect(bp.getByText("Official membership confirmed",{exact:true})).toBeVisible();
    await expect(bp.getByText("Approved academic group",{exact:true})).toBeVisible();
    const official=await (await api.get(path)).json();
    expect(official.officialGroup.members.map((m:{enrollmentId:string})=>m.enrollmentId).sort())
      .toEqual([f.a.enrollmentId,f.b.enrollmentId].sort());
    expect(official.officialGroupCount).toBe(1);
    expect(JSON.stringify(official)).not.toContain(f.b.email);
    expect(JSON.stringify(official)).not.toContain(f.outsider.name);
  } finally {
    await Promise.all(contexts.map(c=>c.close()));
    await Promise.all([api.dispose(),other.dispose(),staffApi.dispose(),anon.dispose()]);
  }
});
