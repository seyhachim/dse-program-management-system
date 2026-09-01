import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
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

class OrderedFakeClient implements TelegramPublicBotClient {
  readonly events: string[] = [];
  readonly sent: TelegramSendMessageInput[] = [];

  async sendMessage(input: TelegramSendMessageInput) {
    this.events.push("send");
    this.sent.push(input);
  }

  async editMessage(_input: TelegramEditMessageInput) {
    this.events.push("edit");
  }

  async answerCallbackQuery(input: TelegramAnswerCallbackInput) {
    this.events.push(input.text ? "ack-unavailable" : "ack");
  }
}

let server: Server;
let baseUrl: string;
let client: OrderedFakeClient;

beforeAll(async () => {
  client = new OrderedFakeClient();
  const publicRead = {
    async getProgramme() {
      return {
        programmeName: "Data Science and Engineering",
        shortName: "DSE",
        overview: "Published overview",
        admissionEmail: null,
        phone: null,
        websiteUrl: null,
        facebookUrl: null,
        campusAddress: null,
        mapUrl: null,
        applicationUrl: null,
      };
    },
    async listFaqs() {
      client.events.push("pms-read");
      return [
        {
          slug: "what-is-dse",
          category: "About" as const,
          question: "What is DSE?",
          answer: "Published DSE answer.",
          shortAnswer: "Published DSE answer.",
          isFeatured: true,
          sourceLabel: null,
          sourceUrl: null,
        },
      ];
    },
    async getAdmission() {
      return {
        applicationUrl: null,
        admissionEmail: null,
        phone: null,
        faqs: [],
      };
    },
    async getFeesScholarships() {
      return { faqs: [] };
    },
    async listImportantDates() {
      return [];
    },
    async getContact() {
      return {
        admissionEmail: null,
        phone: null,
        websiteUrl: null,
        facebookUrl: null,
        campusAddress: null,
        mapUrl: null,
        applicationUrl: null,
      };
    },
  };
  const publicCurriculumRead = {
    async listCourses() {
      return [];
    },
    async getCourse() {
      throw new Error("not used");
    },
    async getStudyPlan() {
      throw new Error("not used");
    },
    async getTotals() {
      throw new Error("not used");
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/telegram/public",
    createPublicTelegramRouter({
      config,
      client,
      publicRead,
      publicCurriculumRead,
      publicSearch: {
        async search() {
          return { kind: "none" as const };
        },
      },
      publicQuestionAnalytics: {
        async observeAskDse() {},
      },
    }),
  );

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function webhook(body: unknown) {
  return fetch(`${baseUrl}/api/telegram/public/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": config.webhookSecret!,
    },
    body: JSON.stringify(body),
  });
}

describe("public Telegram button responsiveness", () => {
  test("acknowledges a valid inline callback before PMS reads and message edit", async () => {
    client.events.length = 0;

    const response = await webhook({
      update_id: 77201,
      callback_query: {
        id: "cb-fast",
        data: "faq:popular",
        message: { message_id: 44, chat: { id: 12 } },
      },
    });

    expect(response.status).toBe(200);
    expect(client.events).toEqual(["ack", "pms-read", "edit"]);
  });

  test("keeps malformed callbacks fail-closed with the unavailable acknowledgement", async () => {
    client.events.length = 0;

    const response = await webhook({
      update_id: 77202,
      callback_query: {
        id: "cb-bad",
        data: "admin:secret",
        message: { message_id: 45, chat: { id: 13 } },
      },
    });

    expect(response.status).toBe(200);
    expect(client.events).toEqual(["ack-unavailable"]);
  });

  test("Explore DSE reply menu is static and performs no PMS public-data read", async () => {
    client.events.length = 0;
    client.sent.length = 0;

    const response = await webhook({
      update_id: 77203,
      message: {
        message_id: 46,
        chat: { id: 14 },
        text: "🚀 Explore DSE",
      },
    });

    expect(response.status).toBe(200);
    expect(client.events).toEqual(["send"]);
    expect(client.sent.at(-1)?.text).toContain("Explore DSE");
  });
});
