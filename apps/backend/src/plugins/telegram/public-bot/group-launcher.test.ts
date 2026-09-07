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
  webhookSecret: "group-launcher-secret",
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
    return [];
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

let searchCalls = 0;
const publicSearch = {
  async search() {
    searchCalls += 1;
    return { kind: "none" as const };
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
      publicSearch,
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

async function webhook(body: unknown, secret = config.webhookSecret!) {
  return fetch(`${baseUrl}/api/telegram/public/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify(body),
  });
}

function launcherButton(input: TelegramSendMessageInput) {
  const markup = input.replyMarkup as {
    inline_keyboard: Array<Array<{ text: string; url?: string }>>;
  };
  return markup.inline_keyboard[0]![0]!;
}

describe("public Telegram group launcher", () => {
  test("group /start returns only the compact private-bot launcher", async () => {
    const response = await webhook({
      update_id: 9501,
      message: {
        message_id: 1,
        chat: { id: -1009501, type: "group" },
        text: "/start",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.chatId).toBe(-1009501);
    expect(sent.text).toContain("🎓 DSE Information Board");
    expect(sent.replyMarkup).toHaveProperty("inline_keyboard");
    expect(sent.replyMarkup).not.toHaveProperty("keyboard");
    expect(launcherButton(sent)).toEqual({
      text: "🚀 Open DSE Information Board",
      url: "https://t.me/dse_test_bot?start=dse_group",
    });
  });

  test("supergroup /dse command addressed to this bot returns the same launcher", async () => {
    const response = await webhook({
      update_id: 9502,
      message: {
        message_id: 2,
        chat: { id: -1009502, type: "supergroup" },
        text: "/dse@dse_test_bot",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.chatId).toBe(-1009502);
    expect(launcherButton(sent).url).toBe(
      "https://t.me/dse_test_bot?start=dse_group",
    );
  });

  test("private group deep link enters the existing language-selection flow", async () => {
    const response = await webhook({
      update_id: 9503,
      message: {
        message_id: 3,
        chat: { id: 9503, type: "private" },
        text: "/start dse_group",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.chatId).toBe(9503);
    expect(sent.text).toBe("សូមជ្រើសរើសភាសា / Choose your language");
    expect(sent.replyMarkup).toHaveProperty("keyboard");
  });

  test("private deep link skips language selection after a locale is already selected", async () => {
    await webhook({
      update_id: 9504,
      message: {
        message_id: 4,
        chat: { id: 9504, type: "private" },
        text: "🇬🇧 English",
      },
    });

    const response = await webhook({
      update_id: 9505,
      message: {
        message_id: 5,
        chat: { id: 9504, type: "private" },
        text: "/start dse_group",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("Welcome to the DSE Program Information Bot");
    expect(sent.replyMarkup).toHaveProperty("keyboard");
  });

  test("ordinary group text and interactive commands do not invoke Ask DSE or post bot UI", async () => {
    const sentBefore = client.sent.length;
    const searchBefore = searchCalls;

    const textResponse = await webhook({
      update_id: 9506,
      message: {
        message_id: 6,
        chat: { id: -1009506, type: "group" },
        text: "What careers can DSE graduates pursue?",
      },
    });
    const coursesResponse = await webhook({
      update_id: 9507,
      message: {
        message_id: 7,
        chat: { id: -1009506, type: "group" },
        text: "/courses",
      },
    });

    expect(textResponse.status).toBe(200);
    expect(coursesResponse.status).toBe(200);
    expect(client.sent.length).toBe(sentBefore);
    expect(searchCalls).toBe(searchBefore);
  });

  test("group launcher preprocessing does not bypass webhook-secret verification", async () => {
    const sentBefore = client.sent.length;
    const response = await webhook(
      {
        update_id: 9508,
        message: {
          message_id: 8,
          chat: { id: -1009508, type: "group" },
          text: "/dse",
        },
      },
      "wrong-secret",
    );

    expect(response.status).toBe(401);
    expect(client.sent.length).toBe(sentBefore);
  });
});
