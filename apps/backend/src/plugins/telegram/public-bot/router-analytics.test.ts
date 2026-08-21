import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
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
  webhookSecret: "secret-123",
  publicProgrammeId: "dse",
  initDataMaxAgeSeconds: 300,
  initDataMaxFutureSkewSeconds: 30,
};

class FakeClient implements TelegramPublicBotClient {
  sent: TelegramSendMessageInput[] = [];
  failSend = false;
  async sendMessage(input: TelegramSendMessageInput) {
    if (this.failSend) throw new Error("telegram unavailable");
    this.sent.push(input);
  }
  async editMessage(_input: TelegramEditMessageInput) {}
  async answerCallbackQuery(_input: TelegramAnswerCallbackInput) {}
}

function publicRead() {
  return {
    async getProgramme() { throw new Error("not used"); },
    async listFaqs() { return []; },
    async getAdmission() { throw new Error("not used"); },
    async getFeesScholarships() { return { faqs: [] }; },
    async listImportantDates() { return []; },
    async getContact() { throw new Error("not used"); },
  };
}

function curriculumRead() {
  return {
    async listCourses() { return []; },
    async getCourse() { throw new Error("not used"); },
    async getStudyPlan() { throw new Error("not used"); },
    async getTotals() { throw new Error("not used"); },
  };
}

type Observed = {
  programmeId: string;
  source: "Telegram";
  questionText: string;
  result: { kind: string };
  answerDelivered: boolean;
  sourceEventKey?: string | null;
  analyticsActorHash?: string | null;
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(
    (server) => new Promise<void>((resolve) => server.close(() => resolve())),
  ));
});

async function setup(options?: { analyticsFails?: boolean; sendFails?: boolean }) {
  const observed: Observed[] = [];
  const client = new FakeClient();
  client.failSend = options?.sendFails ?? false;
  const app = express();
  app.use(express.json());
  app.use("/api/telegram/public", createPublicTelegramRouter({
    config,
    client,
    publicRead: publicRead(),
    publicCurriculumRead: curriculumRead(),
    publicSearch: {
      async search() { return { kind: "none" as const }; },
    },
    publicQuestionAnalytics: {
      async observeAskDse(input) {
        observed.push(input as Observed);
        if (options?.analyticsFails) throw new Error("analytics unavailable");
      },
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address() as AddressInfo;
  return {
    observed,
    client,
    async ask(question: string) {
      return fetch(`http://127.0.0.1:${address.port}/api/telegram/public/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": config.webhookSecret!,
        },
        body: JSON.stringify({
          update_id: 491,
          message: { message_id: 1, chat: { id: 999999 }, text: question },
        }),
      });
    },
  };
}

describe("public Telegram Ask DSE analytics boundary", () => {
  test("records a delivered no-match with purpose-specific hashes and no raw Telegram identity", async () => {
    const harness = await setup();
    const response = await harness.ask("What new DSE club is available?");

    expect(response.status).toBe(200);
    expect(harness.observed).toHaveLength(1);
    expect(harness.observed[0]).toMatchObject({
      programmeId: "dse",
      source: "Telegram",
      questionText: "What new DSE club is available?",
      result: { kind: "none" },
      answerDelivered: true,
    });
    expect(harness.observed[0]?.sourceEventKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(harness.observed[0]?.analyticsActorHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(harness.observed[0]?.sourceEventKey).not.toContain("491");
    expect(harness.observed[0]?.analyticsActorHash).not.toContain("999999");
    expect(harness.observed[0]).not.toHaveProperty("chatId");
    expect(harness.observed[0]).not.toHaveProperty("telegramUserId");
    expect(harness.observed[0]).not.toHaveProperty("clientIp");
    expect(harness.observed[0]).not.toHaveProperty("rateLimitState");
  });

  test("analytics failure is fail-open after a successful Telegram response", async () => {
    const harness = await setup({ analyticsFails: true });
    const response = await harness.ask("Unknown published information");

    expect(response.status).toBe(200);
    expect(harness.client.sent.at(-1)?.text).toContain("couldn't find a confirmed answer");
    expect(harness.observed).toHaveLength(1);
  });

  test("records delivery=false when Telegram send fails", async () => {
    const harness = await setup({ sendFails: true });
    const response = await harness.ask("Unknown published information");

    expect(response.status).toBe(500);
    expect(harness.observed).toHaveLength(1);
    expect(harness.observed[0]?.answerDelivered).toBe(false);
  });
});
