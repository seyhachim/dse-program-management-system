import { connect } from "node:tls";
import type { MailMessage } from "./delivery.ts";

/** Narrow Gmail SMTP submission adapter: implicit TLS, one envelope recipient,
 * no arbitrary host, no plaintext fallback, no provider reply/credential logs.
 * All I/O is bounded. A timeout after DATA has uncertain delivery: do not retry.
 */
export type GmailConfig = { user: string; appPassword: string; from: string; name: string };
export type SmtpExchange = { reply(): Promise<number>; write(data: string): void };
export async function gmailConversation(io: SmtpExchange, config: GmailConfig, message: MailMessage) {
  const expectReply = async (...codes: number[]) => {
    if (!codes.includes(await io.reply())) throw new Error("SMTP submission failed");
  };
  const command = async (line: string, ...codes: number[]) => { io.write(line + "\r\n"); await expectReply(...codes); };
  await expectReply(220);
  await command("EHLO localhost",250);
  await command("AUTH PLAIN "+Buffer.from("\0"+config.user+"\0"+config.appPassword).toString("base64"),235);
  await command("MAIL FROM:<"+config.from+">",250);
  await command("RCPT TO:<"+message.to+">",250,251);
  await command("DATA",354);
  // Base64 text and RFC 2047 headers exclude raw user-controlled line breaks.
  const encoded=(v:string)=>"=?UTF-8?B?"+Buffer.from(v,"utf8").toString("base64")+"?=";
  const body=Buffer.from(message.text,"utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n")??"";
  io.write(["From: "+encoded(config.name)+" <"+config.from+">","To: <"+message.to+">",
    "Subject: "+encoded(message.subject),"Date: "+new Date().toUTCString(),
    "Message-ID: <"+message.id+"@gmail.com>","MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64","",body,".",""].join("\r\n"));
  await expectReply(250);
  // Acceptance is final; QUIT is best effort and must not trigger duplicate delivery.
  try { io.write("QUIT\r\n"); } catch { /* accepted already */ }
}

export async function submitGmail(config: GmailConfig,message: MailMessage): Promise<void> {
  const socket=connect({host:"smtp.gmail.com",port:465,servername:"smtp.gmail.com",rejectUnauthorized:true,minVersion:"TLSv1.2"});
  let buffer="", multiline:number|undefined, failure:Error|undefined;
  const ready:number[]=[];
  let waiter: {resolve:(code:number)=>void;reject:(error:Error)=>void}|undefined;
  const fail=()=>{if(failure)return;failure=new Error("SMTP transport unavailable");waiter?.reject(failure);waiter=undefined;socket.destroy();};
  const timer=setTimeout(fail,15000);
  socket.on("error",fail);socket.on("end",fail);socket.on("close",fail);
  socket.setEncoding("utf8");
  socket.on("data",(data:string)=>{
    if(failure)return;
    buffer+=data;
    if(buffer.length>16384){fail();return;}
    for(;;){
      const i=buffer.indexOf("\r\n");if(i<0)break;
      const line=buffer.slice(0,i);buffer=buffer.slice(i+2);
      const m=/^(\d{3})([ -])/.exec(line);if(!m){fail();return;}
      const code=Number(m[1]);if(multiline!==undefined&&multiline!==code){fail();return;}
      if(m[2]==="-"){multiline=code;continue;}
      multiline=undefined;
      if(waiter){const w=waiter;waiter=undefined;w.resolve(code);}else{ready.push(code);if(ready.length>8){fail();return;}}
    }
  });
  const io:SmtpExchange={
    reply(){if(failure)return Promise.reject(failure);const code=ready.shift();if(code!==undefined)return Promise.resolve(code);return new Promise((resolve,reject)=>{waiter={resolve,reject};});},
    write(data){if(failure||!socket.authorized)throw new Error("SMTP TLS unavailable");socket.write(data);},
  };
  try {await gmailConversation(io,config,message);}
  finally{clearTimeout(timer);socket.destroy();}
}
