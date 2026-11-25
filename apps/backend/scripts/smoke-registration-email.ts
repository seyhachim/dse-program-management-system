import { randomUUID } from "node:crypto";
import { deliverEmail, readEmailDeliveryConfig } from "../src/core/email/delivery.ts";

// Manual one-message transport check. No database or Telegram contact is used.
async function main(){
  if(process.env.DSE_STAGING_ENVIRONMENT!=="true"||process.env.PMS_EMAIL_SMOKE_CONFIRM!=="SEND_ONE_TEST_EMAIL")
    throw new Error("Explicit staging and one-message consent required");
  const to=process.env.PMS_EMAIL_SMOKE_TO;
  if(!to)throw new Error("Set your own authorized test inbox");
  const config=readEmailDeliveryConfig();
  await deliverEmail(config,{id:randomUUID(),to,subject:"DSE PMS staging email transport check",text:"This is a synthetic DSE PMS staging email. No registration or account was created. Confirm receipt in the intended test inbox."});
  console.log("Provider accepted one staging test email. Confirm receipt in the test inbox.");
}
if(import.meta.main)main().catch(()=>{console.error("Staging email test failed; check provider configuration and network access without printing credentials.");process.exitCode=1;});
