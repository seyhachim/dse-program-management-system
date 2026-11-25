import { prisma } from "../core/db/prisma.ts";
import { readEmailDeliveryConfig } from "../core/email/delivery.ts";

// UAT-only, operator-authorized single real self-addressed delivery test.
export async function verifyUatBrevoOnce(){
  if(process.env.AUTH_MODE!=="neon-staging"||
    process.env.DSE_STAGING_ENVIRONMENT!=="true"||
    process.env.DSE_STAGING_DB_MARKER!=="DSE-PMS-STAGING:pr1364-registration-icy-block-a1d1j63q"||
    process.env.DSE_STAGING_DB_HOST!=="ep-solitary-block-a1hm2c16.ap-southeast-1.aws.neon.tech"||
    process.env.TELEGRAM_STUDENT_REGISTRATION_ENABLED!=="false"||
    process.env.TELEGRAM_PMS_ENABLED!=="false"||
    process.env.PMS_EMAIL_PROVIDER!=="brevo")return;
  const id="pr1364-brevo-real-delivery-04";
  try {
    const config=readEmailDeliveryConfig();
    if(config.provider!=="brevo"||config.from!=="seyhachim@gmail.com")return;
    const rows=await prisma.$queryRaw<Array<{id:string}>>`INSERT INTO registration_uat_private.email_smoke(id,state) VALUES (${id},'attempted') ON CONFLICT DO NOTHING RETURNING id`;
    if(!rows.length)return;
    let accepted=false;
    try{
      const response=await fetch("https://api.brevo.com/v3/smtp/email",{
        method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),
        headers:{"api-key":config.key,"Content-Type":"application/json",accept:"application/json"},
        body:JSON.stringify({sender:{name:config.name,email:config.from},to:[{email:config.from}],subject:"DSE PMS staging email delivery test",textContent:"This is the authorized single test email from DSE PMS staging. No student account was created. Please confirm receipt."})
      });
      accepted=response.ok;
      let category="unknown";
      if(accepted){category="provider-accepted";await response.body?.cancel();}
      else {
        const body=await response.json().catch(()=>null) as {code?:unknown;message?:unknown}|null;
        const msg=(typeof body?.message==="string"?body.message:"").toLowerCase();
        const code=(typeof body?.code==="string"?body.code:"").toLowerCase();
        if(/ip address|unauthorized ip|unrecogniz.*ip|ip.*authoriz/.test(msg))category="ip-authorization";
        else if(/sender|domain|dkim|dmarc/.test(msg))category="sender-or-domain";
        else if(/activat|suspend|account.*block|account.*validat|account.*verif/.test(msg))category="account-activation";
        else if(/credit|quota|rate limit|too many/.test(msg)||response.status===429)category="quota-or-rate-limit";
        else if(/permission|scope|forbidden/.test(msg)||code==="permission_denied")category="permission";
        else if(response.status===401||code==="unauthorized")category="authentication";
        else if(response.status===403)category="forbidden";
        else if(response.status===400)category="invalid-request";
        else if(response.status>=500)category="provider-error";
      }
      console.log("Registration UAT Brevo real delivery: HTTP "+response.status+"; category="+category);
    }catch{console.log("Registration UAT Brevo real delivery: network-or-timeout");}
    await prisma.$executeRaw`UPDATE registration_uat_private.email_smoke SET state=${accepted?"accepted":"failed"},updated_at=now() WHERE id=${id}`;
  }catch{console.log("Registration UAT Brevo real delivery unavailable; check configuration.");}
}
