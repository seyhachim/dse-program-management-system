import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { TelegramConfig } from "../config.ts";
import { createProgressivePublicTelegramRouter } from "./progressive-curriculum-router.ts";
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
  webhookSecret: "progressive-secret",
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
  async listFaqs() {
    return [];
  },
  async getAdmission() {
    return {
      applicationUrl: null,
      admissionEmail: "admission@example.edu",
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

const provenance = {
  curriculumVersionId: "curriculum-v1",
  curriculumVersion: "1.0",
  status: "Active" as const,
  sourceFileName: "DSE Curriculum.json",
  sourceSha256: "a".repeat(64),
};

function course(
  code: string,
  title: string,
  yearLevel: number,
  semester: "First" | "Second",
) {
  return {
    code,
    title,
    yearLevel,
    semester,
    credits: 3,
    courseType: "Core",
    weeklyHoursTotal: 4,
    weeklyLectureHours: 2,
    weeklyLabHours: 2,
    weeklyFieldVisitHours: 0,
    lecturerText: "",
    pathwayCode: null,
    conflicts: [],
    provenance,
  };
}

const publicCurriculumRead = {
  async listCourses() {
    return [];
  },
  async getCourse() {
    throw new Error("not used");
  },
  async getStudyPlan(
    _programmeId: string,
    year: number,
    semester: "First" | "Second",
  ) {
    const item =
      semester === "First"
        ? course("SEM1", "Semester One Course", year, semester)
        : course("SEM2", "Semester Two Course", year, semester);
    return {
      yearLevel: year,
      semester,
      courses: [item],
      totalCredits: 3,
      totalWeeklyHours: 4,
      provenance,
    };
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
    createProgressivePublicTelegramRouter({
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

function callbackData(input: TelegramEditMessageInput | undefined): string[] {
  const markup = input?.replyMarkup;
  if (!markup || !("inline_keyboard" in markup)) return [];
  return markup.inline_keyboard
    .flatMap((row) => row)
    .flatMap((button) =>
      "callback_data" in button ? [button.callback_data] : [],
    );
}

describe("public curriculum progressive navigation", () => {
  test("year selection shows semester choices instead of both semester course lists", async () => {
    const response = await webhook({
      update_id: 9701,
      callback_query: {
        id: "cb-year-1",
        data: "curriculum:year:1",
        message: { message_id: 71, chat: { id: 8701 } },
      },
    });

    expect(response.status).toBe(200);
    const edited = client.edited.at(-1)!;
    expect(edited.text).toBe("📚 Year 1\n\nChoose a semester.");
    expect(edited.text).not.toContain("SEM1");
    expect(edited.text).not.toContain("SEM2");
    expect(callbackData(edited)).toEqual([
      "ux:curriculum:1:1",
      "ux:curriculum:1:2",
      "curriculum:menu",
      "nav:home",
    ]);
    expect(client.answered.at(-1)).toEqual({ callbackQueryId: "cb-year-1" });
  });

  test("semester 1 selection shows only semester 1 and keeps Back/Home navigation", async () => {
    const response = await webhook({
      update_id: 9702,
      callback_query: {
        id: "cb-sem-1",
        data: "ux:curriculum:1:1",
        message: { message_id: 71, chat: { id: 8701 } },
      },
    });

    expect(response.status).toBe(200);
    const edited = client.edited.at(-1)!;
    expect(edited.text).toContain("Year 1 · Semester 1");
    expect(edited.text).toContain("SEM1 — Semester One Course");
    expect(edited.text).not.toContain("Semester 2");
    expect(edited.text).not.toContain("SEM2");
    expect(callbackData(edited)).toEqual([
      "curriculum:year:1",
      "nav:home",
    ]);
    expect(client.answered.at(-1)).toEqual({ callbackQueryId: "cb-sem-1" });
  });

  test("semester 2 selection shows only semester 2", async () => {
    const response = await webhook({
      update_id: 9703,
      callback_query: {
        id: "cb-sem-2",
        data: "ux:curriculum:1:2",
        message: { message_id: 71, chat: { id: 8701 } },
      },
    });

    expect(response.status).toBe(200);
    const edited = client.edited.at(-1)!;
    expect(edited.text).toContain("Year 1 · Semester 2");
    expect(edited.text).toContain("SEM2 — Semester Two Course");
    expect(edited.text).not.toContain("Semester 1");
    expect(edited.text).not.toContain("SEM1");
  });

  test("Home remains a concise menu rather than a curriculum dump", async () => {
    const response = await webhook({
      update_id: 9704,
      message: {
        message_id: 72,
        chat: { id: 8701 },
        text: "🏠 Home",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("Welcome to DSE");
    expect(sent.text).not.toContain("Semester One Course");
    expect(sent.text).not.toContain("Semester Two Course");
    const markup = sent.replyMarkup;
    expect(markup && "inline_keyboard" in markup).toBe(true);
    if (markup && "inline_keyboard" in markup) {
      const callbacks = markup.inline_keyboard
        .flatMap((row) => row)
        .flatMap((button) =>
          "callback_data" in button ? [button.callback_data] : [],
        );
      expect(callbacks).toContain("curriculum:menu");
    }
  });
});
