import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  PublicCurriculumConflictError,
  PublicCurriculumNotFoundError,
} from "../../programme/public-curriculum-read-service.ts";
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
  webhookSecret: "secret-123",
  publicProgrammeId: "dse",
  initDataMaxAgeSeconds: 300,
  initDataMaxFutureSkewSeconds: 30,
};

function makePublicRead() {
  return {
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
    async listFaqs(_programmeId: string, filters?: { category?: string; featured?: boolean }) {
      if (filters?.featured) {
        return [{
          slug: "what-is-dse",
          category: "About" as const,
          question: "What is DSE?",
          answer: "Published DSE answer.",
          shortAnswer: "Published DSE answer.",
          isFeatured: true,
          sourceLabel: null,
          sourceUrl: null,
        }];
      }
      return [{
        slug: "admission-requirements",
        category: (filters?.category ?? "Admission") as "Admission",
        question: "What are the admission requirements?",
        answer: "Published admission answer.",
        shortAnswer: null,
        isFeatured: false,
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
}

function makeCurriculumRead() {
  const provenance = {
    curriculumVersionId: "curriculum-v1",
    curriculumVersion: "1.0",
    status: "Active" as const,
    sourceFileName: "DSE Curriculum.json",
    sourceSha256: "a".repeat(64),
  };
  const courses = [
    {
      code: "PAN202",
      title: "Predictive Analytics",
      yearLevel: 2,
      semester: "Second" as const,
      credits: 3,
      courseType: "Core",
      weeklyHoursTotal: 4,
      weeklyLectureHours: 2,
      weeklyLabHours: 2,
      weeklyFieldVisitHours: 0,
      lecturerText: "Mr. Chim Seyha",
      pathwayCode: null,
      conflicts: [],
      provenance,
    },
    {
      code: "NDA202",
      title: "NoSQL Databases",
      yearLevel: 2,
      semester: "Second" as const,
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
    },
  ];
  return {
    async listCourses() { return courses; },
    async getCourse(_programmeId: string, query: string) {
      if (query === "ambiguous") {
        throw new PublicCurriculumConflictError("multiple published courses");
      }
      const course = courses.find((item) => item.code === query || item.title === query);
      if (!course) throw new PublicCurriculumNotFoundError("not found");
      return course;
    },
    async getStudyPlan() {
      return {
        yearLevel: 2,
        semester: "Second" as const,
        courses,
        totalCredits: 6,
        totalWeeklyHours: 8,
        provenance,
      };
    },
    async getTotals() {
      return {
        totalCourses: 2,
        totalCredits: 5,
        computedTotalCourses: 2,
        computedTotalCredits: 6,
        declaredTotalCourses: 2,
        declaredTotalCredits: 5,
        totalWeeklyHours: 8,
        conflicts: ["Official source declares 5 credits while published route rows sum to 6"],
        byYearSemester: [{
          yearLevel: 2,
          semester: "Second" as const,
          courseCount: 2,
          credits: 5,
          computedCredits: 6,
          declaredCredits: 5,
          weeklyHours: 8,
          conflicts: ["Official source declares 5 credits while published course rows sum to 6"],
        }],
        provenance,
      };
    },
  };
}

function makePublicSearch() {
  return {
    async search(_programmeId: string, question: string) {
      if (/python/i.test(question)) {
        return {
          kind: "answer" as const,
          score: 92,
          faq: {
            slug: "programming-experience",
            category: "Admission" as const,
            question: "Do I need programming experience before I study DSE?",
            answer: "Prior programming experience is helpful but not required.",
            shortAnswer: "Programming experience is not required.",
            isFeatured: true,
            sourceLabel: null,
            sourceUrl: null,
          },
        };
      }
      if (/scholarship/i.test(question)) {
        return {
          kind: "suggestions" as const,
          suggestions: [
            {
              score: 64,
              faq: {
                slug: "scholarships",
                category: "FeesScholarships" as const,
                question: "Are scholarships available?",
                answer: "Published scholarship information.",
                shortAnswer: null,
                isFeatured: true,
                sourceLabel: null,
                sourceUrl: null,
              },
            },
            {
              score: 58,
              faq: {
                slug: "scholarship-deadline",
                category: "FeesScholarships" as const,
                question: "When is the scholarship deadline?",
                answer: "Published deadline information.",
                shortAnswer: null,
                isFeatured: false,
                sourceLabel: null,
                sourceUrl: null,
              },
            },
          ],
        };
      }
      return { kind: "none" as const };
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
  app.use("/api/telegram/public", createPublicTelegramRouter({
    config,
    client,
    publicRead: makePublicRead(),
    publicCurriculumRead: makeCurriculumRead(),
    publicSearch: makePublicSearch(),
  }));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
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

describe("public Telegram webhook", () => {
  test("rejects an invalid webhook secret before processing the update", async () => {
    const before = client.sent.length;
    const response = await webhook({ update_id: 1, message: { message_id: 1, chat: { id: 9 }, text: "/start" } }, "wrong");
    expect(response.status).toBe(401);
    expect(client.sent.length).toBe(before);
  });

  test("/start sends the persistent seven-action reply keyboard without PMS login", async () => {
    const response = await webhook({ update_id: 2, message: { message_id: 2, chat: { id: 10 }, text: "/start" } });
    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.chatId).toBe(10);
    expect(sent.text).toContain("DSE Program Information Bot");
    expect(sent.replyMarkup).toHaveProperty("keyboard");
    const keyboard = (sent.replyMarkup as { keyboard: Array<Array<{ text: string }>> }).keyboard;
    expect(keyboard.flat()).toHaveLength(7);
    expect(keyboard.flat().map((item) => item.text)).toContain("❓ Ask DSE");
  });

  test("primary Admission selection renders PMS-owned published FAQ content", async () => {
    const response = await webhook({
      update_id: 3,
      message: { message_id: 3, chat: { id: 11 }, text: "📝 Admission" },
    });
    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("Published admission answer.");
    expect(sent.text).toContain("https://example.edu/apply");
    expect(sent.replyMarkup).toHaveProperty("inline_keyboard");
  });

  test("/courses lists curriculum-backed published courses", async () => {
    const response = await webhook({ update_id: 30, message: { message_id: 30, chat: { id: 20 }, text: "/courses" } });
    expect(response.status).toBe(200);
    expect(client.sent.at(-1)?.text).toContain("PAN202 — Predictive Analytics");
  });

  test("course code lookup returns credits, weekly hours and curriculum provenance", async () => {
    const response = await webhook({ update_id: 31, message: { message_id: 31, chat: { id: 20 }, text: "PAN202" } });
    expect(response.status).toBe(200);
    const text = client.sent.at(-1)?.text ?? "";
    expect(text).toContain("Credits: 3");
    expect(text).toContain("Weekly hours: 4");
    expect(text).toContain("approved curriculum v1.0");
  });

  test("/course not-found lookup is acknowledged in chat instead of returning 500", async () => {
    const response = await webhook({ update_id: 34, message: { message_id: 34, chat: { id: 20 }, text: "/course UNKNOWN" } });
    expect(response.status).toBe(200);
    expect(client.sent.at(-1)?.text).toContain("couldn't find");
  });

  test("/course ambiguous lookup asks for a more specific course instead of returning 500", async () => {
    const response = await webhook({ update_id: 35, message: { message_id: 35, chat: { id: 20 }, text: "/course ambiguous" } });
    expect(response.status).toBe(200);
    expect(client.sent.at(-1)?.text).toContain("matches more than one published course");
  });

  test("year and semester question routes to published curriculum rather than FAQ search", async () => {
    const response = await webhook({ update_id: 32, message: { message_id: 32, chat: { id: 20 }, text: "what do I study in year 2 semester 2?" } });
    expect(response.status).toBe(200);
    const text = client.sent.at(-1)?.text ?? "";
    expect(text).toContain("Year 2 · Semester 2");
    expect(text).toContain("Total: 6 credits · 8 h/week");
  });

  test("credit-load question preserves source-declared totals and exposes row conflicts", async () => {
    const response = await webhook({ update_id: 33, message: { message_id: 33, chat: { id: 20 }, text: "what is the credit load?" } });
    expect(response.status).toBe(200);
    const text = client.sent.at(-1)?.text ?? "";
    expect(text).toContain("Published route total: 2 courses · 5 credits");
    expect(text).toContain("rows sum to 6");
    expect(text).toContain("⚠️ Source conflict");
  });

  test("free-text strong Ask DSE match returns only the approved answer", async () => {
    const response = await webhook({ update_id: 36, message: { message_id: 36, chat: { id: 20 }, text: "need python before study?" } });
    expect(response.status).toBe(200);
    const text = client.sent.at(-1)?.text ?? "";
    expect(text).toContain("Do I need programming experience");
    expect(text).toContain("Programming experience is not required.");
  });

  test("ambiguous Ask DSE search returns ranked confirmed question suggestions", async () => {
    const response = await webhook({ update_id: 37, message: { message_id: 37, chat: { id: 20 }, text: "scholarship" } });
    expect(response.status).toBe(200);
    const text = client.sent.at(-1)?.text ?? "";
    expect(text).toContain("Possible matches");
    expect(text).toContain("Are scholarships available?");
    expect(text).toContain("When is the scholarship deadline?");
  });

  test("no-match Ask DSE query fails safely without inventing an answer", async () => {
    const response = await webhook({ update_id: 38, message: { message_id: 38, chat: { id: 20 }, text: "tell me today's football score" } });
    expect(response.status).toBe(200);
    expect(client.sent.at(-1)?.text).toContain("couldn't find a confirmed answer");
  });

  test("FAQ callback edits the existing message and answers the callback query", async () => {
    const response = await webhook({
      update_id: 4,
      callback_query: {
        id: "cb-1",
        data: "faq:popular",
        message: { message_id: 44, chat: { id: 12 } },
      },
    });
    expect(response.status).toBe(200);
    expect(client.edited.at(-1)?.text).toContain("Published DSE answer.");
    expect(client.edited.at(-1)?.messageId).toBe(44);
    expect(client.answered.at(-1)).toEqual({ callbackQueryId: "cb-1" });
  });

  test("malformed callback fails safely without editing content", async () => {
    const editsBefore = client.edited.length;
    const response = await webhook({
      update_id: 5,
      callback_query: {
        id: "cb-bad",
        data: "admin:secret",
        message: { message_id: 45, chat: { id: 13 } },
      },
    });
    expect(response.status).toBe(200);
    expect(client.edited.length).toBe(editsBefore);
    expect(client.answered.at(-1)?.text).toBe("This action is unavailable.");
  });

  test("malformed Telegram update is acknowledged and ignored", async () => {
    const response = await webhook({ unexpected: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
  });
});
