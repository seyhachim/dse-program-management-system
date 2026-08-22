import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { TelegramConfig } from "../config.ts";
import { createLocalizedPublicTelegramRouter } from "./localized-router.ts";
import type {
  TelegramAnswerCallbackInput,
  TelegramEditMessageInput,
  TelegramPublicBotClient,
  TelegramSendMessageInput,
} from "./telegram-client.ts";

class FakeClient implements TelegramPublicBotClient {
  sent: TelegramSendMessageInput[] = [];
  edited: TelegramEditMessageInput[] = [];
  answered: TelegramAnswerCallbackInput[] = [];

  async sendMessage(input: TelegramSendMessageInput) {
    this.sent.push(input);
  }

  async editMessage(input: TelegramEditMessageInput) {
    this.edited.push(input);
  }

  async answerCallbackQuery(input: TelegramAnswerCallbackInput) {
    this.answered.push(input);
  }
}

const config: TelegramConfig = {
  enabled: true,
  botToken: "123:test-token",
  botUsername: "dse_test_bot",
  miniAppUrl: "https://example.edu/telegram",
  miniAppShortName: "dse",
  webhookSecret: "stale-keyboard-secret",
  publicProgrammeId: "dse",
  initDataMaxAgeSeconds: 300,
  initDataMaxFutureSkewSeconds: 30,
};

const publicRead = {
  async getProgramme() {
    return {
      programmeName: "Data Science and Engineering",
      shortName: "DSE",
      overview: "Published overview",
      admissionEmail: "fe.info@rupp.edu.kh",
      phone: "+855 93 222 380",
      websiteUrl: null,
      facebookUrl: null,
      campusAddress: null,
      mapUrl: null,
      applicationUrl: null,
    };
  },
  async listFaqs() {
    return [];
  },
  async getAdmission() {
    return {
      applicationUrl: null,
      admissionEmail: "fe.info@rupp.edu.kh",
      phone: "+855 93 222 380",
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
      admissionEmail: "fe.info@rupp.edu.kh",
      phone: "+855 93 222 380",
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

let server: Server;
let baseUrl: string;
let client: FakeClient;

beforeAll(async () => {
  client = new FakeClient();
  const app = express();
  app.use(express.json());
  app.use(
    "/api/telegram/public",
    createLocalizedPublicTelegramRouter({
      config,
      client,
      publicRead,
      publicCurriculumRead,
      publicQuestionAnalytics: { async observeAskDse() {} },
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

describe("localized public Telegram stale reply keyboard", () => {
  test("recovers Khmer locale and routes Explore DSE after process locale state is absent", async () => {
    const response = await webhook({
      update_id: 9551,
      message: {
        message_id: 1,
        chat: { id: 9551001 },
        text: "🚀 ស្វែងយល់អំពី DSE",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("ស្វែងយល់អំពី DSE");
    expect(sent.text).not.toContain("ការចូលរៀន");

    const keyboard = (
      sent.replyMarkup as {
        inline_keyboard: Array<
          Array<{ text: string; callback_data?: string }>
        >;
      }
    ).inline_keyboard;
    expect(
      keyboard.flat().map((item) => item.callback_data).filter(Boolean),
    ).toContain("explore:step:1");
    expect(keyboard.flat().map((item) => item.text)).toContain("1 · DSE ជាអ្វី?");
  });
});
