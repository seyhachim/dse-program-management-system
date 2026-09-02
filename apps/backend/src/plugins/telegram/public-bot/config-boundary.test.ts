import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createLocalizedPublicTelegramRouter } from "./localized-router.ts";

const ENV_KEYS = [
  "TELEGRAM_PMS_ENABLED",
  "TELEGRAM_PMS_BOT_TOKEN",
  "TELEGRAM_PMS_BOT_USERNAME",
  "TELEGRAM_PUBLIC_ENABLED",
  "TELEGRAM_PUBLIC_BOT_TOKEN",
  "TELEGRAM_PUBLIC_BOT_USERNAME",
  "TELEGRAM_PUBLIC_WEBHOOK_SECRET",
  "TELEGRAM_PUBLIC_PROGRAMME_ID",
  "TELEGRAM_ENABLED",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_MINI_APP_URL",
  "TELEGRAM_MINI_APP_SHORT_NAME",
] as const;

const original = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
    server = undefined;
  }
  for (const key of ENV_KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function startRouter() {
  const app = express();
  app.use(express.json());
  app.use(createLocalizedPublicTelegramRouter());
  server = app.listen(0);
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
  test("does not become configured from PMS bot credentials", async () => {
    process.env.TELEGRAM_PMS_ENABLED = "true";
    process.env.TELEGRAM_PMS_BOT_TOKEN = "pms-token";
    process.env.TELEGRAM_PMS_BOT_USERNAME = "DSEPMSBot";
    process.env.TELEGRAM_MINI_APP_URL = "https://example.com/telegram";
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = "pms";

    const baseUrl = await startRouter();
    const response = await postWebhook(baseUrl, "anything");

    expect(response.status).toBe(503);
  });

  test("verifies only the dedicated public webhook secret", async () => {
    process.env.TELEGRAM_PMS_ENABLED = "true";
    process.env.TELEGRAM_PMS_BOT_TOKEN = "pms-token";
    process.env.TELEGRAM_PMS_BOT_USERNAME = "DSEPMSBot";
    process.env.TELEGRAM_MINI_APP_URL = "https://example.com/telegram";
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = "pms";
    process.env.TELEGRAM_WEBHOOK_SECRET = "legacy-shared-secret";

    process.env.TELEGRAM_PUBLIC_ENABLED = "true";
    process.env.TELEGRAM_PUBLIC_BOT_TOKEN = "public-token";
    process.env.TELEGRAM_PUBLIC_BOT_USERNAME = "DSEInformationBot";
    process.env.TELEGRAM_PUBLIC_WEBHOOK_SECRET = "public-only-secret";

    const baseUrl = await startRouter();

    const wrong = await postWebhook(baseUrl, "legacy-shared-secret");
    expect(wrong.status).toBe(401);

    const accepted = await postWebhook(baseUrl, "public-only-secret");
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true, ignored: true });
  });
});
