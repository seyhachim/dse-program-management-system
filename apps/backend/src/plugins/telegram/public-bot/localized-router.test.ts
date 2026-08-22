import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
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
  async sendMessage(input: TelegramSendMessageInput) { this.sent.push(input); }
  async editMessage(input: TelegramEditMessageInput) { this.edited.push(input); }
  async answerCallbackQuery(input: TelegramAnswerCallbackInput) { this.answered.push(input); }
}

const config: TelegramConfig = {
  enabled: true,
  botToken: "123:test-token",
  botUsername: "dse_test_bot",
  miniAppUrl: "https://example.edu/telegram",
  miniAppShortName: "dse",
  webhookSecret: "locale-secret",
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
      admissionEmail: "admission@example.edu",
      phone: null,
      websiteUrl: null,
      facebookUrl: null,
      campusAddress: null,
      mapUrl: null,
      applicationUrl: null,
    };
  },
  async listFaqs(_programmeId: string, filters?: { category?: "About" | "Admission" | "Curriculum" | "Careers" | "FeesScholarships" | "StudentLife" | "Facilities" | "Lecturers" | "ImportantDates" | "Contact"; featured?: boolean }) {
    return [{
      slug: "admission-requirements",
      category: filters?.category ?? "Admission" as const,
      question: "What are the admission requirements?",
      answer: "Published admission answer.",
      shortAnswer: null,
      isFeatured: Boolean(filters?.featured),
      sourceLabel: null,
      sourceUrl: null,
    }];
  },
  async getAdmission() {
    return {
      applicationUrl: "https://example.edu/apply",
      admissionEmail: "admission@example.edu",
      phone: null,
      faqs: [{
        slug: "admission-requirements",
        category: "Admission" as const,
        question: "What are the admission requirements?",
        answer: "Published admission answer.",
        shortAnswer: null,
        isFeatured: false,
        sourceLabel: null,
        sourceUrl: null,
      }],
    };
  },
  async getFeesScholarships() { return { faqs: [] }; },
  async listImportantDates() { return []; },
  async getContact() {
    return {
      admissionEmail: "admission@example.edu",
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
  async listCourses() { return []; },
  async getCourse() { throw new Error("not used"); },
  async getStudyPlan() { throw new Error("not used"); },
  async getTotals() { throw new Error("not used"); },
};

let server: Server;
let baseUrl: string;
let client: FakeClient;

beforeAll(async () => {
  client = new FakeClient();
  const app = express();
  app.use(express.json());
  app.use("/api/telegram/public", createLocalizedPublicTelegramRouter({
    config,
    client,
    publicRead,
    publicCurriculumRead,
    publicQuestionAnalytics: { async observeAskDse() {} },
  }));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
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

describe("localized public Telegram router", () => {
  test("/start asks for Khmer or English without changing webhook security", async () => {
    const response = await webhook({
      update_id: 9001,
      message: { message_id: 1, chat: { id: 7001 }, text: "/start" },
    });
    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toBe("សូមជ្រើសរើសភាសា / Choose your language");
    const keyboard = (sent.replyMarkup as { keyboard: Array<Array<{ text: string }>> }).keyboard;
    expect(keyboard.flat().map((item) => item.text)).toEqual([
      "🇰🇭 ភាសាខ្មែរ",
      "🇬🇧 English",
    ]);
  });

  test("Khmer selection renders localized menu labels while preserving English route keys", async () => {
    const response = await webhook({
      update_id: 9002,
      message: { message_id: 2, chat: { id: 7001 }, text: "🇰🇭 ភាសាខ្មែរ" },
    });
    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("សូមស្វាគមន៍មកកាន់បូតព័ត៌មានកម្មវិធី DSE");
    const keyboard = (sent.replyMarkup as { keyboard: Array<Array<{ text: string }>> }).keyboard;
    expect(keyboard.flat().map((item) => item.text)).toContain("📝 ការចូលរៀន");
    expect(keyboard.flat().map((item) => item.text)).toContain("🌐 ភាសា");
  });

  test("Khmer reply keyboard label routes to the existing Admission route", async () => {
    const response = await webhook({
      update_id: 9003,
      message: { message_id: 3, chat: { id: 7001 }, text: "📝 ការចូលរៀន" },
    });
    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("ការចូលរៀន");
    expect(sent.text).toContain("Published admission answer.");
    expect(sent.text).toContain("ដាក់ពាក្យ: https://example.edu/apply");
  });

  test("localized inline labels keep callback data unchanged", async () => {
    const response = await webhook({
      update_id: 9004,
      callback_query: {
        id: "cb-9004",
        data: "admission:menu",
        message: { message_id: 40, chat: { id: 7001 } },
      },
    });
    expect(response.status).toBe(200);
    const edited = client.edited.at(-1)!;
    const keyboard = (edited.replyMarkup as { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> }).inline_keyboard;
    expect(keyboard.flat().map((item) => item.callback_data).filter(Boolean)).toContain("nav:home");
    expect(keyboard.flat().map((item) => item.text)).toContain("🏠 ទំព័រដើម");
  });

  test("language switch returns to selector and English can be selected again", async () => {
    await webhook({
      update_id: 9005,
      message: { message_id: 5, chat: { id: 7001 }, text: "🌐 ភាសា" },
    });
    expect(client.sent.at(-1)?.text).toBe("សូមជ្រើសរើសភាសា / Choose your language");

    await webhook({
      update_id: 9006,
      message: { message_id: 6, chat: { id: 7001 }, text: "🇬🇧 English" },
    });
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("Welcome to the DSE Program Information Bot");
    const keyboard = (sent.replyMarkup as { keyboard: Array<Array<{ text: string }>> }).keyboard;
    expect(keyboard.flat().map((item) => item.text)).toContain("📝 Admission");
    expect(keyboard.flat().map((item) => item.text)).toContain("🌐 Language");
  });
});
