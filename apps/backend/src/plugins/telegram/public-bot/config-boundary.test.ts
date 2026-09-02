import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getPublicTelegramConfig } from "../config.ts";
import { createLocalizedPublicTelegramRouter } from "./localized-router.ts";

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server!.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
});

async function startRouter(config: ReturnType<typeof getPublicTelegramConfig>) {
  const app = express();
  app.use(express.json());
  app.use(
    createLocalizedPublicTelegramRouter({
      config,
      rateLimiter: {
        check: () => ({ allowed: true, retryAfterSeconds: 0, remaining: 100 }),
      },
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function postWebhook(baseUrl: string, secret: string) {
  return fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify({}),
  });
}

describe("Public Telegram bot credential boundary", () => {
  test("PMS-only credentials cannot configure the public webhook", async () => {
    const config = getPublicTelegramConfig({
      TELEGRAM_PMS_ENABLED: "true",
      TELEGRAM_PMS_BOT_TOKEN: "pms-token",
      TELEGRAM_PMS_BOT_USERNAME: "DSEPMSBot",
      TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
      TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      TELEGRAM_WEBHOOK_SECRET: "legacy-shared-secret",
    } as NodeJS.ProcessEnv);

    expect(config.enabled).toBe(false);
    expect(config.botToken).toBeUndefined();
    expect(config.webhookSecret).toBeUndefined();

    const baseUrl = await startRouter(config);
    const response = await postWebhook(baseUrl, "legacy-shared-secret");
    expect(response.status).toBe(503);
  });

  test("public webhook accepts only its dedicated public secret", async () => {
    const config = getPublicTelegramConfig({
      TELEGRAM_PMS_ENABLED: "true",
      TELEGRAM_PMS_BOT_TOKEN: "pms-token",
      TELEGRAM_PMS_BOT_USERNAME: "DSEPMSBot",
      TELEGRAM_WEBHOOK_SECRET: "legacy-shared-secret",
      TELEGRAM_PUBLIC_ENABLED: "true",
      TELEGRAM_PUBLIC_BOT_TOKEN: "public-token",
      TELEGRAM_PUBLIC_BOT_USERNAME: "DSEInformationBot",
      TELEGRAM_PUBLIC_WEBHOOK_SECRET: "public-only-secret",
    } as NodeJS.ProcessEnv);

    expect(config.botToken).toBe("public-token");
    expect(config.webhookSecret).toBe("public-only-secret");

    const baseUrl = await startRouter(config);

    const wrong = await postWebhook(baseUrl, "legacy-shared-secret");
    expect(wrong.status).toBe(401);

    const accepted = await postWebhook(baseUrl, "public-only-secret");
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true, ignored: true });
  });
});
