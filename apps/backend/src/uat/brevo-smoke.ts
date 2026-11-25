import { prisma } from "../core/db/prisma.ts";
import { readEmailDeliveryConfig, deliverEmail } from "../core/email/delivery.ts";

// UAT branch ONLY. Exact host/issuer are already validated by server startup.
// No HTTP endpoint, no recipient input, no student record, no OTP. One durable
// claim before sending; process restarts must never repeat the same probe.
export async function verifyUatBrevoOnce(){
  if(process.env.AUTH_MODE!=="neon-staging"||
    process.env.DSE_STAGING_ENVIRONMENT!=="true"||
    process.env.DSE_STAGING_DB_MARKER!=="DSE-PMS-STAGING:pr1364-registration-icy-block-a1d1j63q"||
    process.env.DSE_STAGING_DB_HOST!=="ep-solitary-block-a1hm2c16.ap-southeast-1.aws.neon.tech"||
    process.env.TELEGRAM_STUDENT_REGISTRATION_ENABLED!=="false"||
    process.env.TELEGRAM_PMS_ENABLED!=="false"||
    process.env.PMS_EMAIL_PROVIDER!=="brevo")return;
  const id="pr1364-brevo-smoke-20261125-01";
  try{
    const config=readEmailDeliveryConfig();
    if(config.provider!=="brevo"||config.from!=="seyhachim@gmail.com"){
      console.log("Registration UAT mail probe skipped: configured sender does not match authorized test mailbox.");
      return;
    }
    const rows=await prisma.$queryRaw<Array<{id:string}>>`INSERT INTO registration_uat_private.email_smoke(id,state) VALUES (${id},'attempted') ON CONFLICT DO NOTHING RETURNING id`;
    if(!rows.length)return;
    try{
      await deliverEmail(config,{id,to:config.from,subject:"DSE PMS staging email transport check",text:"This is a single synthetic DSE PMS staging email. No registration or account was created. Please confirm receipt."});
      await prisma.$executeRaw`UPDATE registration_uat_private.email_smoke SET state='accepted',updated_at=now() WHERE id=${id}`;
      console.log("Registration UAT mail probe: provider accepted one message.");
    }catch{
      await prisma.$executeRaw`UPDATE registration_uat_private.email_smoke SET state='failed',updated_at=now() WHERE id=${id}`;
      console.log("Registration UAT mail probe: delivery not confirmed; no automatic retry.");
    }
  }catch{console.log("Registration UAT mail probe unavailable; no automatic retry.");}
}
