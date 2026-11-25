import { describe, expect, test } from "bun:test";
import express from "express";
import { createExamVariantWorkspaceRouter, examWorkspacePilotKey } from "./exam-variant-workspace-router.ts";

const valid = { NODE_ENV: "test", DATABASE_URL: "postgresql://ci:ci@127.0.0.1/dse_ci", EXAM_VARIANT_WORKSPACE_ENABLED: "true", EXAM_VARIANT_PROPOSAL_KEY: "ab".repeat(32) };

describe("exam variant workspace activation", () => {
  test("fails closed without all isolated pilot requirements", () => {
    expect(examWorkspacePilotKey(valid)?.length).toBe(32);
    for (const env of [
      {}, { ...valid, NODE_ENV: "production" }, { ...valid, EXAM_VARIANT_WORKSPACE_ENABLED: "false" },
      { ...valid, EXAM_VARIANT_PROPOSAL_KEY: "" }, { ...valid, DATABASE_URL: "postgresql://ci:ci@db.example.com/dse_ci" },
      { ...valid, DATABASE_URL: "postgresql://ci:ci@localhost/dse_prod" },
      { ...valid, DATABASE_URL: "not a URL" },
    ]) expect(examWorkspacePilotKey(env)).toBeNull();
  });
  test("disabled route has no payload and enabled route requires authentication", async () => {
    const app = express();
    app.use(express.json());
    app.use("/disabled",createExamVariantWorkspaceRouter({}));
    app.use("/enabled",createExamVariantWorkspaceRouter(valid));
    const server=app.listen(0,"127.0.0.1");
    try {
      if(!server.listening) await new Promise<void>(resolve=>server.once("listening",resolve));
      const address=server.address();
      if(!address||typeof address==="string")throw new Error("Missing test server address");
      const url="http://127.0.0.1:"+address.port;
      for(const endpoint of ["workspace","preview","submit","decide","permit","assign","history","resolve"]){
        const disabled=await fetch(url+"/disabled/exam-variants/"+endpoint,{method:"POST"});
        expect(disabled.status).toBe(404);
        expect(disabled.headers.get("cache-control")).toBe("private, no-store");
        expect(await disabled.json()).toEqual({error:"Examination workspace disabled"});
        const enabled=await fetch(url+"/enabled/exam-variants/"+endpoint,{method:"POST"});
        expect(enabled.status).toBe(401);
        expect(enabled.headers.get("cache-control")).toBe("private, no-store");
        await enabled.text();
      }
    } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
  });
});
