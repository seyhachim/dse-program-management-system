import { submitGmail, type GmailConfig } from "./gmail-smtp.ts";

export type MailMessage={id:string;to:string;subject:string;text:string};
export type EmailDeliveryConfig =
  | ({provider:"gmail-smtp"} & GmailConfig)
  | {provider:"brevo";key:string;from:string;name:string}
  | {provider:"resend";key:string;from:string;name:string;fromHeader?:string};
export class EmailDeliveryError extends Error {
  constructor(){super("Email delivery unavailable");}
}
const address=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/;
function mailbox(value:string){if(value.length>254||!address.test(value)||value.includes(".."))throw new EmailDeliveryError();return value.toLowerCase();}
function required(v:string|undefined){if(!v?.trim()||/[\r\n\0]/.test(v))throw new EmailDeliveryError();return v.trim();}
export function readEmailDeliveryConfig(env:NodeJS.ProcessEnv=process.env):EmailDeliveryConfig{
  // Existing installations may still have the old Resend-only variable names.
  // No implicit fallback on provider failure, and an explicit provider always wins.
  const provider=env.PMS_EMAIL_PROVIDER??(env.TELEGRAM_REGISTRATION_RESEND_API_KEY?"resend":"disabled");
  const name=required(env.PMS_EMAIL_FROM_NAME??"DSE PMS");
  if(name.length>64)throw new EmailDeliveryError();
  if(provider==="gmail-smtp"){
    // Render Free blocks SMTP; retain the adapter for local or SMTP-capable hosting.
    if(env.RENDER==="true"&&env.PMS_EMAIL_SMTP_ALLOWED!=="true")throw new EmailDeliveryError();
    const user=mailbox(required(env.PMS_EMAIL_GMAIL_USER));
    const from=mailbox(required(env.PMS_EMAIL_FROM??user));
    if(!user.endsWith("@gmail.com")||from!==user)throw new EmailDeliveryError();
    const appPassword=required(env.PMS_EMAIL_GMAIL_APP_PASSWORD).replace(/ /g,"");
    if(!/^[A-Za-z0-9]{16}$/.test(appPassword))throw new EmailDeliveryError();
    return {provider,user,from,name,appPassword};
  }
  if(provider==="brevo")return {provider,key:required(env.PMS_EMAIL_BREVO_API_KEY),from:mailbox(required(env.PMS_EMAIL_FROM)),name};
  if(provider==="resend"){
    const header=required(env.PMS_EMAIL_FROM??env.TELEGRAM_REGISTRATION_EMAIL_FROM);
    const legacy=/^([^<>\r\n]+) <([^<>]+)>$/.exec(header);
    const from=mailbox(legacy?.[2]??header);
    return {provider,key:required(env.PMS_EMAIL_RESEND_API_KEY??env.TELEGRAM_REGISTRATION_RESEND_API_KEY),from,name,fromHeader:legacy?header:undefined};
  }
  throw new EmailDeliveryError();
}
type Dependencies={fetch?:typeof fetch;smtp?:typeof submitGmail};
export async function deliverEmail(config:EmailDeliveryConfig,message:MailMessage,deps:Dependencies={}):Promise<void>{
  // A single plain mailbox, a generated id, and bounded plain-text messages only.
  const to=mailbox(message.to);
  if(!/^[a-zA-Z0-9-]{1,128}$/.test(message.id)||!message.subject||message.subject.length>128||/[\r\n\0]/.test(message.subject)||!message.text||message.text.length>10000)throw new EmailDeliveryError();
  try{
    if(config.provider==="gmail-smtp"){await (deps.smtp??submitGmail)(config,{...message,to});return;}
    const call=deps.fetch??fetch;
    const common={method:"POST",signal:AbortSignal.timeout(10000),redirect:"error" as const};
    const response=config.provider==="resend"?
      await call("https://api.resend.com/emails",{...common,headers:{Authorization:"Bearer "+config.key,"Content-Type":"application/json","Idempotency-Key":message.id},body:JSON.stringify({from:config.fromHeader??config.name+" <"+config.from+">",to:[to],subject:message.subject,text:message.text})}):
      await call("https://api.brevo.com/v3/smtp/email",{...common,headers:{"api-key":config.key,"Content-Type":"application/json",accept:"application/json"},body:JSON.stringify({sender:{email:config.from,name:config.name},to:[{email:to}],subject:message.subject,textContent:message.text})});
    if(!response.ok)throw new EmailDeliveryError();
    // HTTP success means provider acceptance, not inbox delivery.
  }catch{throw new EmailDeliveryError();}
}
