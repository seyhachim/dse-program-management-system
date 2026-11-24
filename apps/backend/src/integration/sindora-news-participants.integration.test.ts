import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";

const suite = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const body = "Students explored regenerative farming and discussed how to gather evidence for practical and maintainable data-driven decisions at an organic pepper farm.";
suite("Sindora trip participants and DSE News — isolated integration", () => {
  let server:Server | undefined, base="";
  let lecturer:AuthUser, coordinator:AuthUser, student:AuthUser, outsider:AuthUser;
  let courseId="",offeringId="",activityId="",participantId="",articleId="",studentId="";
  let madeProfile=false;
  beforeAll(async () => {
    const host=new URL(process.env.DATABASE_URL??"postgresql://invalid:invalid@invalid.invalid/test").hostname;
    if(!["localhost","127.0.0.1"].includes(host))throw Error("Refusing hosted database for trip test");
    process.env.AUTH_MODE="dev";
    process.env.JWT_SECRET="isolated-sindora-travel-news-integration-secret-123456789";
    lecturer = await loadUser("lecturer@dse.dev");
    coordinator = await loadUser("coordinator@dse.dev");
    student = await loadUser("student@dse.dev");
    outsider={...lecturer,id:"not-assigned-lecturer",programmeRoles:[{role:"lecturer",programmeId:"elsewhere"}]};
    let profile=await prisma.student.findUnique({where:{userId:student.id}});
    if(!profile){profile=await prisma.student.create({data:{name:"Synthetic Student",email:student.email,userId:student.id,status:"Active"}});madeProfile=true;}
    studentId=profile.id;
    const code="AIE-TRIP-NEWS-"+crypto.randomUUID().slice(0,8);
    const course=await prisma.course.create({data:{code,title:"Synthetic Sindora learning trip",programmeId:"dse"}});
    courseId=course.id;
    const offering=await prisma.offering.create({data:{courseId,lecturerId:lecturer.id,term:"TEST-2026",sectionCode:"STG"}});
    offeringId=offering.id;
    await prisma.enrollment.create({data:{offeringId,studentId}});
    const act=await prisma.offeringActivity.create({data:{
      offeringId,title:"Synthetic Sindora trip",type:"field_visit",date:new Date("2026-11-22T00:00:00.000Z"),
      host:"Synthetic Test Farm",createdById:lecturer.id,updatedById:lecturer.id,
    }});
    activityId=act.id;
    server=createApp().listen(0,"127.0.0.1");
    await once(server,"listening");
    base="http://127.0.0.1:"+(server.address() as AddressInfo).port;
  });
  afterAll(async()=>{
    if(server?.listening)await new Promise<void>((ok,bad)=>server!.close(err=>err?bad(err):ok()));
    if(articleId){await prisma.dseNewsAuditEvent.deleteMany({where:{articleId}});await prisma.dseNewsArticle.deleteMany({where:{id:articleId}});}
    if(participantId){await prisma.offeringActivityParticipantAudit.deleteMany({where:{participantId}});await prisma.offeringActivityParticipant.deleteMany({where:{id:participantId}});}
    if(activityId)await prisma.offeringActivity.deleteMany({where:{id:activityId}});
    if(offeringId){await prisma.enrollment.deleteMany({where:{offeringId}});await prisma.offering.deleteMany({where:{id:offeringId}});}
    if(courseId)await prisma.course.deleteMany({where:{id:courseId}});
    if(madeProfile)await prisma.student.deleteMany({where:{id:studentId}});
    await prisma.$disconnect();
  });
  async function request(path:string,actor:AuthUser|null,method="GET",data?:unknown){
    const headers=new Headers();if(actor)headers.set("Authorization","Bearer "+signToken(actor));
    if(data!==undefined)headers.set("Content-Type","application/json");
    const res=await fetch(base+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
    return {status:res.status,body:await res.json() as any};
  }
  test("trip roster is staff-only; signatures do not prove presence at farm",async()=>{
    const path="/api/offerings/"+offeringId+"/activities/"+activityId+"/participants";
    expect((await request(path,null)).status).toBe(401);
    expect((await request(path,student)).status).toBe(403);
    expect((await request(path,outsider)).status).toBe(403);
    const saved=await request(path,lecturer,"POST",{studentId,goStatus:"Marked",returnStatus:"Marked",source:"PaperTripSheet"});
    expect(saved.status).toBe(201);participantId=saved.body.id;
    expect(saved.body.farmStatus).toBe("Unverified");
    expect((await request(path,lecturer,"POST",{studentId})).status).toBe(409);
    const edit=path+"/"+participantId;
    expect((await request(edit,lecturer,"PATCH",{expectedVersion:1,farmStatus:"Confirmed"})).status).toBe(409);
    expect((await request(edit,lecturer,"PATCH",{expectedVersion:1,farmStatus:"Confirmed",source:"HostVerified"})).status).toBe(200);
    expect((await request(edit,lecturer,"PATCH",{expectedVersion:1,note:"stale"})).status).toBe(409);
    const counts=await prisma.$queryRawUnsafe<Array<{total:bigint}>>(
      'SELECT count(*)::bigint AS total FROM pms_attendance."AttendanceSession" WHERE "offeringId"=$1',offeringId);
    expect(Number(counts[0]?.total??0n)).toBe(0);
    expect(await prisma.offeringActivityParticipantAudit.count({where:{participantId}})).toBe(2);
  });
  test("only coordinator publishes and DSE student reads approved article, never private roster",async()=>{
    const path="/api/student-portal/news/manage";
    const draft={title:"Synthetic Sindora Study Visit",summary:"Regenerative agriculture field learning",body,
      activityId,tags:["Field Visit"],coverImageUrl:null,coverAlt:"",gallery:[],mediaApproved:false};
    expect((await request(path,student,"POST",draft)).status).toBe(403);
    const created=await request(path,lecturer,"POST",draft);
    expect(created.status).toBe(201);articleId=created.body.id;
    expect((await request("/api/student-portal/news",student)).body).toEqual([]);
    expect((await request("/api/student-portal/news/"+articleId,student)).status).toBe(404);
    const statusPath=path+"/"+articleId+"/status";
    expect((await request(statusPath,lecturer,"POST",{expectedVersion:1,status:"Published"})).status).toBe(403);
    const published=await request(statusPath,coordinator,"POST",{expectedVersion:1,status:"Published"});
    expect(published.status).toBe(200);
    const stories=await request("/api/student-portal/news",student);
    expect(stories.status).toBe(200);
    const item=stories.body.find((x:{id:string})=>x.id===articleId);
    expect(item.body).toContain("regenerative farming");
    expect(JSON.stringify(item)).not.toContain("Marked");
    expect((await request("/api/student-portal/news",outsider)).status).toBe(403);
    expect((await request(statusPath,coordinator,"POST",{expectedVersion:1,status:"Draft"})).status).toBe(409);
    expect(await prisma.dseNewsAuditEvent.count({where:{articleId}})).toBe(2);
  });
});
async function loadUser(email:string):Promise<AuthUser>{
  const row=await prisma.user.findUniqueOrThrow({where:{email},include:{roleAssignments:{include:{role:true}}}});
  return {id:row.id,email:row.email,roles:row.roleAssignments.map(a=>a.role.slug as Role),
    programmeRoles:row.roleAssignments.map(a=>({role:a.role.slug as Role,programmeId:a.programmeId}))};
}
