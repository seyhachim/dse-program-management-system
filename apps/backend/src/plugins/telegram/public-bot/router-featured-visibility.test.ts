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
  webhookSecret: "featured-secret",
  publicProgrammeId: "dse",
  initDataMaxAgeSeconds: 300,
  initDataMaxFutureSkewSeconds: 30,
};

const featuredAdmission = {
  slug: "admission-requirements",
  category: "Admission" as const,
  question: "What are the admission requirements?",
  answer: "Featured admission answer.",
  shortAnswer: null,
  isFeatured: true,
  sourceLabel: null,
  sourceUrl: null,
};

const hiddenAdmission = {
  slug: "admission-eligibility",
  category: "Admission" as const,
  question: "Who can apply?",
  answer: "Published but non-important answer.",
  shortAnswer: null,
  isFeatured: false,
  sourceLabel: null,
  sourceUrl: null,
};

function makePublicRead() {
  return {
    async getProgramme() {
      return {
        programmeName: "DSE",
        shortName: "DSE",
        overview: "Overview",
        admissionEmail: null,
        phone: null,
        websiteUrl: null,
        facebookUrl: null,
        campusAddress: null,
        mapUrl: null,
        applicationUrl: null,
      };
    },
    async listFaqs(
      _programmeId: string,
      filters?: { category?: string; featured?: boolean },
    ) {
      const faqs = [featuredAdmission, hiddenAdmission];
      return faqs.filter(
        (faq) =>
          (!filters?.category || faq.category === filters.category) &&
          (filters?.featured === undefined || faq.isFeatured === filters.featured),
      );
    },
    async getFaqBySlug(_programmeId: string, slug: string) {
      const faq = [featuredAdmission, hiddenAdmission].find(
        (candidate) => candidate.slug === slug,
      );
      if (!faq) throw new Error("not found");
      return faq;
    },
    async getAdmission() {
      return { applicationUrl: null, admissionEmail: null, phone: null, faqs: [] };
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
}

function makeCurriculumRead() {
  return {
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
}

let server: Server;
let baseUrl: string;
let client: FakeClient;

beforeAll(async () => {
  client = new FakeClient();
  const app = express();
  app.use(express.json());
  app.use(
    "/api/telegram/public",
    createPublicTelegramRouter({
      config,
      client,
      publicRead: makePublicRead(),
      publicCurriculumRead: makeCurriculumRead(),
      publicSearch: {
        async search() {
          return { kind: "answer" as const, score: 90, faq: hiddenAdmission };
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

function callbackData(markup: unknown): string[] {
  const rows = (
    markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    }
  ).inline_keyboard ?? [];
  return rows.flatMap((row) =>
    row.flatMap((button) =>
      button.callback_data ? [button.callback_data] : [],
    ),
  );
}

describe("Telegram important FAQ visibility", () => {
  test("Admission menu shows only published featured FAQ question buttons", async () => {
    const response = await webhook({
      update_id: 1,
      callback_query: {
        id: "admission-menu",
        data: "admission:menu",
        message: { message_id: 10, chat: { id: 100 } },
      },
    });

    expect(response.status).toBe(200);
    const callbacks = callbackData(client.edited.at(-1)?.replyMarkup);
    expect(callbacks).toContain("admission:requirements");
    expect(callbacks).not.toContain("admission:eligibility");
    expect(callbacks).not.toContain("admission:how_to_apply");
    expect(callbacks).toContain("dates:application_deadline");
    expect(callbacks).toContain("fit:start");
    expect(callbacks).toContain("nav:home");
  });

  test("a still-published non-featured FAQ remains directly retrievable", async () => {
    const response = await webhook({
      update_id: 2,
      callback_query: {
        id: "cached-hidden-faq",
        data: "admission:eligibility",
        message: { message_id: 11, chat: { id: 100 } },
      },
    });

    expect(response.status).toBe(200);
    expect(client.edited.at(-1)?.text).toContain(
      "Published but non-important answer.",
    );
  });

  test("typed Ask DSE can still answer from a published non-featured FAQ", async () => {
    const response = await webhook({
      update_id: 3,
      message: {
        message_id: 12,
        chat: { id: 100 },
        text: "Can I apply to DSE?",
      },
    });

    expect(response.status).toBe(200);
    expect(client.sent.at(-1)?.text).toContain(
      "Published but non-important answer.",
    );
  });
});
