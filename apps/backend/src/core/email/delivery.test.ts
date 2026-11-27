import { describe, expect, test } from "bun:test";
import { deliverEmail, readEmailDeliveryConfig, EmailDeliveryError } from "./delivery.ts";
import { gmailConversation } from "./gmail-smtp.ts";
const msg={id:"test-request-1",to:"student@rupp.edu.kh",subject:"DSE verification",text:"Synthetic code 123456"};
const gmail={PMS_EMAIL_PROVIDER:"gmail-smtp",PMS_EMAIL_GMAIL_USER:"test@gmail.com",PMS_EMAIL_GMAIL_APP_PASSWORD:"abcd efgh ijkl mnop"};
const brevo={PMS_EMAIL_PROVIDER:"brevo",PMS_EMAIL_FROM:"test@gmail.com",PMS_EMAIL_BREVO_API_KEY:"synthetic-key"};
const resend={PMS_EMAIL_PROVIDER:"resend",PMS_EMAIL_FROM:"test@example.invalid",PMS_EMAIL_RESEND_API_KEY:"synthetic-key"};
describe("transactional email provider selection",()=>{
  test("defaults off and refuses incomplete or unsupported configuration",()=>{
    for(const env of [{},{PMS_EMAIL_PROVIDER:"brevo"},{PMS_EMAIL_PROVIDER:"unknown"},{...gmail,PMS_EMAIL_FROM:"other@gmail.com"},{...gmail,RENDER:"true"},{...gmail,PMS_EMAIL_GMAIL_APP_PASSWORD:"wrong"}]){
      expect(()=>readEmailDeliveryConfig(env)).toThrow(EmailDeliveryError);
    }
    expect(readEmailDeliveryConfig(gmail).provider).toBe("gmail-smtp");
    expect(readEmailDeliveryConfig(brevo).provider).toBe("brevo");
    expect(readEmailDeliveryConfig(resend).provider).toBe("resend");
    expect(readEmailDeliveryConfig({TELEGRAM_REGISTRATION_RESEND_API_KEY:"old-key",TELEGRAM_REGISTRATION_EMAIL_FROM:"DSE <test@example.invalid>"}).provider).toBe("resend");
  });
  test("Gmail selects the SMTP adapter and validates envelope addresses before transport",async()=>{
    const c=readEmailDeliveryConfig(gmail);
    let count=0;
    const smtp=async()=>{count++;};
    await deliverEmail(c,msg,{smtp});expect(count).toBe(1);
    await expect(deliverEmail(c,{...msg,to:"student@rupp.edu.kh\r\nRCPT TO:<other@example.invalid>"},{smtp})).rejects.toThrow(EmailDeliveryError);
    expect(count).toBe(1);
  });
  test("Gmail SMTP conversation requires authentication and DATA acceptance, encodes message",async()=>{
    const config=readEmailDeliveryConfig(gmail);
    if(config.provider!=="gmail-smtp")throw new Error("wrong config");
    const replies=[220,250,235,250,250,354,250],writes:string[]=[];
    await gmailConversation({reply:async()=>replies.shift()??0,write:s=>{writes.push(s);}},config,msg);
    expect(writes[0]).toBe("EHLO localhost\r\n");
    expect(writes[1]).toStartWith("AUTH PLAIN ");
    expect(writes[2]).toBe("MAIL FROM:<test@gmail.com>\r\n");
    expect(writes[3]).toBe("RCPT TO:<student@rupp.edu.kh>\r\n");
    expect(writes[5]).toContain(Buffer.from(msg.text).toString("base64"));
    expect(writes[5]).toEndWith("\r\n.\r\n");
    expect(writes[6]).toBe("QUIT\r\n");
    const rejected=[220,250,535];let dataSent=false;
    await expect(gmailConversation({reply:async()=>rejected.shift()??0,write:s=>{if(s.startsWith("DATA"))dataSent=true;}},config,msg)).rejects.toThrow("SMTP submission failed");
    expect(dataSent).toBe(false);
  });
  test("Brevo and Resend use only fixed HTTPS API endpoints and exact recipient",async()=>{
    for(const [env,url] of [[brevo,"https://api.brevo.com/v3/smtp/email"],[resend,"https://api.resend.com/emails"]] as const){
      const fake=(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
        expect(String(input)).toBe(url);expect(init?.redirect).toBe("error");
        const body=JSON.parse(String(init?.body));
        if(url.includes("brevo")){expect(body.to).toEqual([{email:msg.to}]);expect(body.textContent).toBe(msg.text);}
        else{expect(body.to).toEqual([msg.to]);expect(body.text).toBe(msg.text);}
        return new Response("{}",{status:201});
      }) as typeof fetch;
      await deliverEmail(readEmailDeliveryConfig(env),msg,{fetch:fake});
    }
  });
  test("provider failure returns a generic error, without fallback",async()=>{
    let count=0;
    const fake=(async (_input:Parameters<typeof fetch>[0], _init?:Parameters<typeof fetch>[1])=>{count++;return new Response("secret provider detail",{status:429});}) as typeof fetch;
    await expect(deliverEmail(readEmailDeliveryConfig(brevo),msg,{fetch:fake})).rejects.toThrow("Email delivery unavailable");
    expect(count).toBe(1);
  });
});
