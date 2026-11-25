import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { telegramIdentityStore } from "./identity-store.ts";
import { createTelegramReplayStore } from "./replay-store.ts";
import { issueTelegramSession, resolveTelegramSession } from "./session.ts";

const dbTestsEnabled = process.env.TELEGRAM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const replayStore = createTelegramReplayStore();
const originalJwtSecret = process.env.JWT_SECRET;

const createdUserIds = new Set<string>();
const telegramUserIds = new Set<string>();

function numericTelegramId(): string {
  return String(1_000_000_000 + Math.floor(Math.random() * 8_000_000_000));
}

async function createUser(label: string) {
  const token = crypto.randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `telegram-${label}-${token}@example.test`,
      name: `Telegram ${label} ${token}`,
    },
  });
  createdUserIds.add(user.id);
  return user;
}

async function createVerification(
  telegramUserId: string,
  options: { expired?: boolean } = {},
) {
  telegramUserIds.add(telegramUserId);
  const now = new Date();
  return replayStore.record({
    rawInitData: `telegram-db-test-${crypto.randomUUID()}`,
    telegramUserId,
    queryId: `query-${crypto.randomUUID()}`,
    authDate: now,
    expiresAt: new Date(now.getTime() + (options.expired ? -1_000 : 5 * 60_000)),
  });
}

beforeAll(() => {
  process.env.JWT_SECRET = "telegram-db-test-secret-at-least-32-characters";
});

afterAll(async () => {
  if (createdUserIds.size > 0 || telegramUserIds.size > 0) {
    const users = [...createdUserIds];
    const telegramIds = [...telegramUserIds];
    await prisma.$executeRaw`
      DELETE FROM "telegram_security"."TelegramAuditEvent"
      WHERE "userId" = ANY(${users}::text[]) OR "telegramUserId" = ANY(${telegramIds}::text[])
    `;
    await prisma.$executeRaw`
      DELETE FROM "telegram_security"."TelegramInitVerification"
      WHERE "telegramUserId" = ANY(${telegramIds}::text[])
    `;
    if (users.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
  }
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  await prisma.$disconnect();
});

describeDb("Telegram identity/session PostgreSQL security", () => {
  test("links only a fresh verified Telegram identity and rejects one-to-one conflicts", async () => {
    const firstUser = await createUser("first");
    const secondUser = await createUser("second");
    const firstTelegramId = numericTelegramId();
    const secondTelegramId = numericTelegramId();

    const firstVerification = await createVerification(firstTelegramId);
    const linked = await telegramIdentityStore.link(firstUser.id, firstVerification.verificationId);

    expect(linked.userId).toBe(firstUser.id);
    expect(linked.telegramUserId).toBe(firstTelegramId);
    expect(linked.revokedAt).toBeNull();
    expect(await telegramIdentityStore.findActiveByTelegramUserId(firstTelegramId)).not.toBeNull();

    const reusedTelegramVerification = await createVerification(firstTelegramId);
    await expect(
      telegramIdentityStore.link(secondUser.id, reusedTelegramVerification.verificationId),
    ).rejects.toMatchObject({ code: "TELEGRAM_LINK_CONFLICT" });

    const switchedTelegramVerification = await createVerification(secondTelegramId);
    await expect(
      telegramIdentityStore.link(firstUser.id, switchedTelegramVerification.verificationId),
    ).rejects.toMatchObject({ code: "TELEGRAM_LINK_CONFLICT" });

    const consumed = await prisma.$queryRaw<Array<{ consumedAt: Date | null }>>`
      SELECT "consumedAt"
      FROM "telegram_security"."TelegramInitVerification"
      WHERE "id" = ${firstVerification.verificationId}
    `;
    expect(consumed[0]?.consumedAt).toBeInstanceOf(Date);

    const audits = await prisma.$queryRaw<Array<{ action: string }>>`
      SELECT "action"
      FROM "telegram_security"."TelegramAuditEvent"
      WHERE "userId" = ${firstUser.id}
    `;
    expect(audits.map((row) => row.action)).toContain("identity_linked");
  });

  test("rejects expired link verifications", async () => {
    const user = await createUser("expired");
    const telegramUserId = numericTelegramId();
    const verification = await createVerification(telegramUserId, { expired: true });

    await expect(
      telegramIdentityStore.link(user.id, verification.verificationId),
    ).rejects.toMatchObject({ code: "INIT_DATA_EXPIRED" });
    expect(await telegramIdentityStore.findActiveByTelegramUserId(telegramUserId)).toBeNull();
  });

  test("revocation immediately invalidates an already-issued Mini App session", async () => {
    const user = await createUser("revoke");
    const telegramUserId = numericTelegramId();
    const verification = await createVerification(telegramUserId);
    const identity = await telegramIdentityStore.link(user.id, verification.verificationId);
    const session = issueTelegramSession(identity);

    expect(await telegramIdentityStore.revoke(user.id)).toBe(true);
    expect(await telegramIdentityStore.findActiveByTelegramUserId(telegramUserId)).toBeNull();
    await expect(resolveTelegramSession(session.token)).rejects.toThrow("revoked");

    const audits = await prisma.$queryRaw<Array<{ action: string }>>`
      SELECT "action"
      FROM "telegram_security"."TelegramAuditEvent"
      WHERE "userId" = ${user.id}
      ORDER BY "createdAt" ASC
    `;
    expect(audits.map((row) => row.action)).toContain("identity_revoked");
  });

  test("a session for an identity absent from PostgreSQL fails closed", async () => {
    const userId = crypto.randomUUID();
    const telegramUserId = numericTelegramId();
    const token = issueTelegramSession({
      id: crypto.randomUUID(),
      userId,
      telegramUserId,
      telegramUsername: null,
      linkedAt: new Date(),
      lastVerifiedAt: new Date(),
      revokedAt: null,
    }).token;

    await expect(resolveTelegramSession(token)).rejects.toThrow("revoked");
  });
});

describeDb("Telegram student registration — isolated verification and activation journey", () => {
  test("blocks approval until email ownership, links only the official student, then permits Mini App access", async () => {
    const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://invalid:invalid@remote.invalid/db").hostname;
    if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
      throw new Error("Registration journey test requires isolated local PostgreSQL");
    }
    const runId = crypto.randomUUID();
    const telegramUserId = numericTelegramId();
    const email = "registration-test-" + runId + "@rupp.edu.kh";
    const botToken = "synthetic-registration-bot-token";
    const settings: Record<string,string> = {
      AUTH_MODE:"dev", TELEGRAM_STUDENT_REGISTRATION_ENABLED:"true", TELEGRAM_PMS_ENABLED:"true",
      TELEGRAM_PMS_BOT_TOKEN:botToken, TELEGRAM_PMS_BOT_USERNAME:"synthetic_registration_bot",
      TELEGRAM_PMS_WEBHOOK_SECRET:"synthetic-webhook-secret", TELEGRAM_MINI_APP_URL:"https://example.invalid/telegram",
      TELEGRAM_MINI_APP_SHORT_NAME:"pms", TELEGRAM_REGISTRATION_EMAIL_OTP_SECRET:"isolated-registration-test-secret-not-for-production",
      PMS_EMAIL_PROVIDER:"resend", PMS_EMAIL_RESEND_API_KEY:"synthetic-resend-key", PMS_EMAIL_FROM:"test@example.invalid", PMS_EMAIL_FROM_NAME:"DSE Test",
    };
    const previous = Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));
    Object.assign(process.env,settings);
    const originalFetch = globalThis.fetch;
    let receivedCode = "";
    let emailCount = 0;
    let notificationCount = 0;
    const capturedFetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url === "https://api.resend.com/emails") {
        const payload = JSON.parse(String(init?.body)) as {to:string[];text:string};
        expect(payload.to).toEqual([email]);
        receivedCode = payload.text.match(/code is ([0-9]{6})/)?.[1] ?? "";
        expect(receivedCode).toHaveLength(6);
        emailCount++;
        return new Response(JSON.stringify({id:"synthetic-email"}),{status:200});
      }
      if (url === "https://api.telegram.org/bot"+botToken+"/sendMessage") {
        const payload = JSON.parse(String(init?.body)) as {chat_id:string;text:string};
        expect(String(payload.chat_id)).toBe(telegramUserId);
        expect(payload.text).toContain("approved");
        notificationCount++;
        return new Response(JSON.stringify({ok:true,result:{message_id:123}}),{status:200});
      }
      throw new Error("Unexpected outbound request in isolated registration test");
    }) as typeof fetch;
    globalThis.fetch = capturedFetch;
    let cohortId="", sectionId="", studentId="", applicantId="", reviewActorId="", activatedUserId="";
    let server: import("node:http").Server | undefined;
    try {
      const cohort = await prisma.studentCohort.create({data:{programmeId:"dse",code:"TEST-"+runId,name:"Synthetic registration cohort",intakeYear:2026,expectedGraduationYear:2030}});
      cohortId=cohort.id; sectionId=crypto.randomUUID();
      await prisma.$executeRaw`INSERT INTO "StudentCohortSection" ("id","cohortId","code","name") VALUES (${sectionId},${cohortId},'M1','Synthetic M1')`;
      const student = await prisma.student.create({data:{name:"Synthetic Registration Student",email,studentId:"TEST-"+runId}});
      studentId=student.id;
      const joinedAt=new Date("2026-11-01T00:00:00Z");
      await prisma.studentCohortMembership.create({data:{cohortId,studentId,joinedAt}});
      await prisma.$executeRaw`INSERT INTO "StudentCohortSectionMembership" ("id","sectionId","cohortId","studentId","joinedAt","note")
        VALUES (${crypto.randomUUID()},${sectionId},${cohortId},${studentId},CAST('2026-11-01' AS date),'isolated registration test')`;
      const actor=await createUser("registration-reviewer"); reviewActorId=actor.id;
      const {signToken}=await import("../../core/auth/token.ts");
      const reviewerToken=signToken({id:actor.id,email:actor.email,roles:["admin"],programmeRoles:[{role:"admin",programmeId:null}]});
      const {studentRegistrationBotReply}=await import("./student-registration-bot.ts");
      const {createStudentRegistrationRouter}=await import("./student-registration-router.ts");
      const {createTelegramRouter}=await import("./router.ts");
      const {default:express}=await import("express");
      const app=express();
      app.use(express.json());
      app.use("/api/telegram",createStudentRegistrationRouter());
      app.use("/api/telegram",createTelegramRouter());
      server=app.listen(0,"127.0.0.1");
      await new Promise<void>((resolve,reject)=>{server!.once("listening",resolve);server!.once("error",reject);});
      const base="http://127.0.0.1:"+(server.address() as import("node:net").AddressInfo).port+"/api/telegram";
      async function post(path:string,body:unknown,token?:string) {
        const response=await originalFetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(body)});
        return {status:response.status,body:await response.json() as Record<string,unknown>};
      }
      function signedLaunch() {
        const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),query_id:crypto.randomUUID(),user:JSON.stringify({id:Number(telegramUserId),first_name:"Synthetic"})});
        const data=Array.from(p.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
        const secret=createHmac("sha256","WebAppData").update(botToken).digest();
        p.set("hash",createHmac("sha256",secret).update(data).digest("hex"));
        return p.toString();
      }
      const message={from:{id:Number(telegramUserId),is_bot:false},chat:{id:Number(telegramUserId),type:"private"}};
      expect(await studentRegistrationBotReply({message:{...message,text:"/start student_register"}})).not.toBeNull();
      expect(await studentRegistrationBotReply({message:{...message,text:"Continue without phone"}})).not.toBeNull();
      const bootstrap=await post("/registration/bootstrap",{initData:signedLaunch()});
      expect(bootstrap.status).toBe(200); expect(bootstrap.body.state).toBe("FORM");
      const verificationId=String(bootstrap.body.verificationId);
      const careerProfile={interests:["Machine Learning (ML)"],programmingLevel:"Beginner",careerGoal:"Still exploring",opportunityInterests:["hackathon"]};
      const input={verificationId,khmerFamilyName:"សុខ",khmerGivenName:"ដារ៉ា",latinFamilyName:"Synthetic",latinGivenName:"Student",cohortId,sectionId,emailNotIssued:true,careerProfile};
      const application=await post("/registration/requests",input);
      expect(application.status).toBe(201);
      applicantId=String(application.body.requestId);
      expect(application.body.status).toBe("PENDING");
      expect((await post("/registration/requests",input)).status).toBe(401);
      expect((await prisma.student.findUnique({where:{id:studentId}}))?.userId).toBeNull();
      const review={decision:"APPROVE",studentId,identityConfirmed:true,reason:"Synthetic independent identity verification"};
      const reviewPath="/registration/staff/requests/"+applicantId+"/review";
      expect((await post(reviewPath,review)).status).toBe(401);
      expect((await post(reviewPath,review,reviewerToken)).status).toBe(409);
      const pending=await post("/registration/bootstrap",{initData:signedLaunch()});
      expect(pending.body.state).toBe("PENDING");
      expect(pending.body.emailVerified).toBe(false);
      const emailSession=String(pending.body.verificationId);
      expect((await post("/registration/email/send",{verificationId:crypto.randomUUID(),email})).status).toBe(403);
      expect((await post("/registration/email/send",{verificationId:emailSession,email})).status).toBe(200);
      expect(emailCount).toBe(1);
      expect((await post("/registration/email/send",{verificationId:emailSession,email})).status).toBe(429);
      expect((await post("/registration/email/verify",{verificationId:emailSession,code:receivedCode==="000000"?"000001":"000000"})).status).toBe(400);
      expect((await post(reviewPath,review,reviewerToken)).status).toBe(409);
      const verified=await post("/registration/email/verify",{verificationId:emailSession,code:receivedCode});
      expect(verified.status).toBe(200);
      expect(verified.body.verified).toBe(true);
      const approval=await post(reviewPath,review,reviewerToken);
      expect(approval.status).toBe(200);expect(approval.body.status).toBe("APPROVED");
      expect(approval.body.notification).toBe("SENT");expect(notificationCount).toBe(1);
      activatedUserId=(await prisma.student.findUnique({where:{id:studentId}}))?.userId??"";
      expect(activatedUserId).not.toBe("");
      const login=await post("/auth/verify",{initData:signedLaunch()});
      expect(login.status).toBe(200);expect(login.body.linked).toBe(true);
      const session=await resolveTelegramSession(String(login.body.sessionToken));
      expect(session.id).toBe(activatedUserId);expect(session.roles).toEqual(["student"]);
      const stored=await prisma.$queryRaw<Array<{preferences:unknown}>>`SELECT "preferences" FROM "StudentCareerProfile" WHERE "studentId"=${studentId}`;
      expect(stored[0]?.preferences).toEqual(careerProfile);
      expect((await post(reviewPath,review,reviewerToken)).status).toBe(409);
      expect(notificationCount).toBe(1);
    } finally {
      globalThis.fetch=originalFetch;
      for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
      if(server?.listening)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
      await prisma.$executeRaw`DELETE FROM "telegram_security"."StudentRegistrationReview" WHERE "requestId" IN (SELECT "id" FROM "telegram_security"."StudentRegistrationRequest" WHERE "telegramUserId"=${telegramUserId})`;
      await prisma.$executeRaw`DELETE FROM "telegram_security"."StudentRegistrationRequest" WHERE "telegramUserId"=${telegramUserId}`;
      await prisma.$executeRaw`DELETE FROM "telegram_security"."StudentRegistrationBotConsent" WHERE "telegramUserId"=${telegramUserId}`;
      await prisma.$executeRaw`DELETE FROM "telegram_security"."TelegramAuditEvent" WHERE "telegramUserId"=${telegramUserId}`;
      await prisma.$executeRaw`DELETE FROM "telegram_security"."TelegramIdentity" WHERE "telegramUserId"=${telegramUserId}`;
      await prisma.$executeRaw`DELETE FROM "telegram_security"."TelegramInitVerification" WHERE "telegramUserId"=${telegramUserId}`;
      if(studentId){
        const row=await prisma.student.findUnique({where:{id:studentId}});
        activatedUserId=activatedUserId||row?.userId||"";
        await prisma.$executeRaw`DELETE FROM "StudentCohortSectionMembership" WHERE "studentId"=${studentId}`;
        await prisma.studentCohortMembership.deleteMany({where:{studentId}});
        await prisma.student.delete({where:{id:studentId}});
      }
      if(activatedUserId)await prisma.user.delete({where:{id:activatedUserId}});
      if(sectionId)await prisma.$executeRaw`DELETE FROM "StudentCohortSection" WHERE "id"=${sectionId}`;
      if(cohortId)await prisma.studentCohort.delete({where:{id:cohortId}});
      if(reviewActorId){await prisma.user.delete({where:{id:reviewActorId}});createdUserIds.delete(reviewActorId);}
    }
  }, 30000);
});
