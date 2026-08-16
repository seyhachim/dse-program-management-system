import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { createTelegramRouter } from "./router.ts";
import type { TelegramService } from "./service.ts";

const service: TelegramService = {
  publicConfig: () => ({
    enabled: true,
    botUsername: "DSEPMSBot",
    miniAppUrl: "https://example.com/telegram",
    miniAppShortName: "pms",
  }),
  health: () => ({ ok: true, enabled: true, configured: true }),
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use("/api/telegram", createTelegramRouter(service));
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("Telegram router", () => {
  test("returns public configuration without secrets", async () => {
    const response = await fetch(`${baseUrl}/api/telegram/config`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      enabled: true,
      botUsername: "DSEPMSBot",
      miniAppUrl: "https://example.com/telegram",
      miniAppShortName: "pms",
    });
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  test("returns local integration readiness", async () => {
    const response = await fetch(`${baseUrl}/api/telegram/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, enabled: true, configured: true });
  });
});
