import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { FixedWindowRateLimiter, type PublicAbuseProtectionConfig } from "../../../core/security/public-abuse-protection.ts";
import type { TelegramConfig } from "../config.ts";
import { createPublicTelegramRouter } from "./router.ts";
import type {
  TelegramAnswerCallbackInput,
  TelegramEditMessageInput,
  TelegramPublicBotClient,
  TelegramSendMessageInput,
} from "./telegram-client.ts";

const config: TelegramConfig = {
  enabled: true,
  botToken: "123:test-token",
  botUsername: "dse_test_bot",
  miniAppUrl: "https://example.edu/telegram",
  miniAppShortName: "dse",
  webhookSecret: "secret-492",
  publicProgrammeId: "dse",
  initDataMaxAgeSeconds: 300,
  initDataMaxFutureSkewSeconds: 30,
};

const baseAbuseConfig: PublicAbuseProtectionConfig = {
  publicSearchMax: 10,
  publicSearchWindowMs: 1_000,
  telegramGlobalUpdateMax: 100,
  telegramActorUpdateMax: 100,
  telegramCallbackMax: 100,
  telegramAskDseMax: 100,
  telegramWindowMs: 1_000,
  telegramMaxUpdateBytes: 2_048,
};

class FakeClient implements TelegramPublicBotClient {
  sent: TelegramSendMessageInput[] = [];
  edited: TelegramEditMessageInput[] = [];
  answered: TelegramAnswerCallbackInput[] = [];
  async sendMessage(input: TelegramSendMessageInput) { this.sent.push(input); }
  async editMessage(input: TelegramEditMessageInput) { this.edited.push(input); }
  async answerCallbackQuery(input: TelegramAnswerCallbackInput) { this.answered.push(input); }
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function setup(overrides: Partial<PublicAbuseProtectionConfig> = {}) {
  const client = new FakeClient();
  const analytics: unknown[] = [];
  let searchCalls = 0;
  let now = 10_000;
  const app = express();
  app.use(express.json());
  app.use("/api/telegram/public", createPublicTelegramRouter({
    config,
    client,
    abuseConfig: { ...baseAbuseConfig, ...overrides },
    rateLimiter: new FixedWindowRateLimiter(),
    now: () => now,
    publicRead: {
      async getProgramme() { throw new Error("not used"); },
      async listFaqs() { return []; },
      async getAdmission() { throw new Error("not used"); },
      async getFeesScholarships() { return { faqs: [] }; },
      async listImportantDates() { return []; },
      async getContact() { throw new Error("not used"); },
    },
    publicCurriculumRead: {
      async listCourses() { return []; },
      async getCourse() { throw new Error("not used"); },
      async getStudyPlan() { throw new Error("not used"); },
      async getTotals() { throw new Error("not used"); },
    },
    publicSearch: {
      async search() {
        searchCalls += 1;
        return { kind: "none" as const };
      },
    },
    publicQuestionAnalytics: {
      async observeAskDse(input) { analytics.push(input); },
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;

  async function webhook(body: unknown, secret = config.webhookSecret!) {
    return fetch(`http://127.0.0.1:${address.port}/api/telegram/public/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": secret,
      },
      body: JSON.stringify(body),
    });
  }

  return {
    client,
    analytics,
    get searchCalls() { return searchCalls; },
    setNow(value: number) { now = value; },
    webhook,
  };
}

describe("public Telegram abuse admission", () => {
  test("enforces the webhook secret before admitting work", async () => {
    const harness = await setup();
    const response = await harness.webhook(
      { update_id: 1, message: { message_id: 1, chat: { id: 1 }, text: "/start" } },
      "wrong",
    );
    expect(response.status).toBe(401);
    expect(harness.client.sent).toHaveLength(0);
  });

  test("bounds per-actor update work and resets after the window", async () => {
    const harness = await setup({ telegramActorUpdateMax: 1 });
    const body = (id: number) => ({ update_id: id, message: { message_id: id, chat: { id: 77 }, text: "/start" } });

    expect((await harness.webhook(body(1))).status).toBe(200);
    const blocked = await harness.webhook(body(2));
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toEqual({ ok: true, rateLimited: true });
    expect(harness.client.sent).toHaveLength(1);

    harness.setNow(11_001);
    expect((await harness.webhook(body(3))).status).toBe(200);
    expect(harness.client.sent).toHaveLength(2);
  });

  test("rate-limits Ask DSE before search and does not pollute analytics", async () => {
    const harness = await setup({ telegramAskDseMax: 1 });
    const first = { update_id: 10, message: { message_id: 10, chat: { id: 88 }, text: "unknown one" } };
    const second = { update_id: 11, message: { message_id: 11, chat: { id: 88 }, text: "unknown two" } };

    expect((await harness.webhook(first)).status).toBe(200);
    const blocked = await harness.webhook(second);
    expect(await blocked.json()).toEqual({ ok: true, rateLimited: true });
    expect(harness.searchCalls).toBe(1);
    expect(harness.analytics).toHaveLength(1);
  });

  test("ignores oversized and malformed updates without downstream work", async () => {
    const harness = await setup({ telegramMaxUpdateBytes: 160 });
    const oversized = await harness.webhook({
      update_id: 20,
      message: { message_id: 20, chat: { id: 90 }, text: "x".repeat(500) },
    });
    expect(await oversized.json()).toEqual({ ok: true, ignored: true });
    expect(harness.client.sent).toHaveLength(0);

    const malformed = await harness.webhook({ unexpected: true });
    expect(await malformed.json()).toEqual({ ok: true, ignored: true });
    expect(harness.client.sent).toHaveLength(0);
  });

  test("rejects callback payloads above Telegram's 64-byte limit before route work", async () => {
    const harness = await setup();
    const response = await harness.webhook({
      update_id: 30,
      callback_query: {
        id: "cb-long",
        data: "x".repeat(65),
        message: { message_id: 30, chat: { id: 91 } },
      },
    });
    expect(response.status).toBe(200);
    expect(harness.client.edited).toHaveLength(0);
    expect(harness.client.answered.at(-1)?.text).toBe("This action is unavailable.");
  });
});
