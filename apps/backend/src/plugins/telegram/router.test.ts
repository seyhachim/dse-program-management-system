import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { TelegramInitDataError } from "./init-data.ts";
import { TelegramInitDataReplayError } from "./replay-store.ts";
import { createTelegramRouter } from "./router.ts";
import {
  TelegramDisabledError,
  type TelegramService,
} from "./service.ts";

let verifyFailure: Error | undefined;

const service: TelegramService = {
  publicConfig: () => ({
    enabled: true,
    botUsername: "DSEPMSBot",
    miniAppUrl: "https://example.com/telegram",
    miniAppShortName: "pms",
  }),
  health: () => ({ ok: true, enabled: true, configured: true }),
  verifyInitData: async () => {
    if (verifyFailure) throw verifyFailure;
    return {
      verified: true,
      verificationId: "550e8400-e29b-41d4-a716-446655440000",
      telegramUser: { id: "123456789", username: "seyha" },
      authDate: "2026-08-16T05:00:00.000Z",
      expiresAt: "2026-08-16T05:05:00.000Z",
    };
  },
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
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

async function verify(body: unknown) {
  return fetch(`${baseUrl}/api/telegram/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

  test("returns the verified pre-link identity contract", async () => {
    verifyFailure = undefined;
    const response = await verify({ initData: "signed-init-data" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      verified: true,
      verificationId: "550e8400-e29b-41d4-a716-446655440000",
      telegramUser: { id: "123456789", username: "seyha" },
      authDate: "2026-08-16T05:00:00.000Z",
      expiresAt: "2026-08-16T05:05:00.000Z",
    });
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("role");
    expect(body).not.toHaveProperty("permissions");
  });

  test("rejects malformed request bodies before verification", async () => {
    for (const body of [{}, { initData: "" }]) {
      const response = await verify(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_INIT_DATA");
    }
  });

  test("maps invalid signatures to 401 without crypto details", async () => {
    verifyFailure = new TelegramInitDataError("INVALID_INIT_DATA", "sensitive detail");
    const response = await verify({ initData: "signed-init-data" });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_INIT_DATA");
    expect(JSON.stringify(body)).not.toContain("sensitive detail");
  });

  test("maps stale or future-dated init data to 401", async () => {
    verifyFailure = new TelegramInitDataError("INIT_DATA_EXPIRED", "sensitive detail");
    const response = await verify({ initData: "signed-init-data" });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("INIT_DATA_EXPIRED");
  });

  test("maps replayed valid init data to 409", async () => {
    verifyFailure = new TelegramInitDataReplayError();
    const response = await verify({ initData: "signed-init-data" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INIT_DATA_REPLAYED");
  });

  test("fails closed when Telegram is disabled", async () => {
    verifyFailure = new TelegramDisabledError();
    const response = await verify({ initData: "signed-init-data" });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("TELEGRAM_DISABLED");
  });
});
