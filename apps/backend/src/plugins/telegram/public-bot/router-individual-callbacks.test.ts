import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
  webhookSecret: "secret-123",
  publicProgrammeId: "dse",
  initDataMaxAgeSeconds: 300,
  initDataMaxFutureSkewSeconds: 30,
};

function faq(slug: string, question: string, answer: string) {
  return {
    slug,
    category: "About" as const,
    question,
    answer,
    shortAnswer: null,
    isFeatured: false,
    sourceLabel: null,
    sourceUrl: null,
  };
}

function makePublicRead() {
  return {
    async getProgramme() {
      return {
        programmeName: "Data Science and Engineering",
        shortName: "DSE",
        overview: "Published overview",
        admissionEmail: "admission@example.edu",
        phone: "+855 93 222 380",
        websiteUrl: "https://example.edu/dse",
        facebookUrl: null,
        campusAddress: "Room 302, STEM Building",
        mapUrl: null,
        applicationUrl: null,
      };
    },
    async listFaqs() {
      return [faq("category-fallback", "Category question", "Category answer")];
    },
    async getFaqBySlug(_programmeId: string, slug: string) {
      if (slug === "why-dse") {
        return faq(slug, "Why DSE?", "Specific published Why DSE answer.");
      }
      if (slug === "admission-requirements") {
        return {
          ...faq(
            slug,
            "What are the admission requirements?",
            "Specific published admission requirements.",
          ),
          category: "Admission" as const,
        };
      }
      throw new Error("FAQ not found");
    },
    async getAdmission() {
      return {
        applicationUrl: null,
        admissionEmail: "admission@example.edu",
        phone: "+855 93 222 380",
        faqs: [],
      };
    },
    async getFeesScholarships() {
      return { faqs: [] };
    },
    async listImportantDates(_programmeId: string, filters?: { kind?: string }) {
      if (filters?.kind === "ApplicationDeadline") {
        return [
          {
            kind: "ApplicationDeadline" as const,
            title: "Application deadline",
            description: "Published deadline",
            date: "2026-09-30",
            endDate: null,
          },
        ];
      }
      return [];
    },
    async getContact() {
      return {
        admissionEmail: "admission@example.edu",
        phone: "+855 93 222 380",
        websiteUrl: "https://example.edu/dse",
        facebookUrl: null,
        campusAddress: "Room 302, STEM Building",
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
  const course = {
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
    lecturerText: "",
    pathwayCode: null,
    conflicts: [],
    provenance,
  };

  return {
    async listCourses() {
      return [course];
    },
    async getCourse() {
      return course;
    },
    async getStudyPlan(
      _programmeId: string,
      yearLevel: number,
      semester: "First" | "Second",
    ) {
      return {
        yearLevel,
        semester,
        courses: [
          {
            ...course,
            yearLevel,
            semester,
          },
        ],
        totalCredits: 3,
        totalWeeklyHours: 4,
        provenance,
      };
    },
    async getTotals() {
      return {
        totalCourses: 1,
        totalCredits: 3,
        computedTotalCourses: 1,
        computedTotalCredits: 3,
        declaredTotalCourses: 1,
        declaredTotalCredits: 3,
        totalWeeklyHours: 4,
        conflicts: [],
        byYearSemester: [],
        provenance,
      };
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

async function callback(data: string, updateId: number) {
  return fetch(`${baseUrl}/api/telegram/public/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": config.webhookSecret!,
    },
    body: JSON.stringify({
      update_id: updateId,
      callback_query: {
        id: `cb-${updateId}`,
        data,
        message: { message_id: updateId, chat: { id: 99 } },
      },
    }),
  });
}

describe("public Telegram individual callback routing", () => {
  test("About detail resolves a specific published FAQ by slug", async () => {
    const response = await callback("about:why_dse", 1001);
    expect(response.status).toBe(200);
    expect(client.edited.at(-1)?.text).toContain(
      "Specific published Why DSE answer.",
    );
    expect(client.edited.at(-1)?.text).not.toContain("Category answer");
  });

  test("Admission detail resolves a specific published FAQ by slug", async () => {
    const response = await callback("admission:requirements", 1002);
    expect(response.status).toBe(200);
    expect(client.edited.at(-1)?.text).toContain(
      "Specific published admission requirements.",
    );
  });

  test("missing or draft-equivalent detail fails safely without category masquerading", async () => {
    const response = await callback("about:vs_cs", 1003);
    expect(response.status).toBe(200);
    expect(client.edited.at(-1)?.text).toContain(
      "No published information is available yet",
    );
    expect(client.edited.at(-1)?.text).toContain("dse vs computer science");
    expect(client.edited.at(-1)?.text).not.toContain("Category answer");
  });

  test("Year button reads both semesters from the canonical published curriculum service", async () => {
    const response = await callback("curriculum:year:1", 1004);
    expect(response.status).toBe(200);
    const text = client.edited.at(-1)?.text ?? "";
    expect(text).toContain("Year 1 · Semester 1");
    expect(text).toContain("Year 1 · Semester 2");
    expect(text).toContain("approved curriculum v1.0");
  });

  test("All courses button uses canonical published curriculum rows", async () => {
    const response = await callback("curriculum:courses:page:1", 1005);
    expect(response.status).toBe(200);
    expect(client.edited.at(-1)?.text).toContain(
      "PAN202 — Predictive Analytics",
    );
  });

  test("date button filters to its specific published kind", async () => {
    const response = await callback("dates:application_deadline", 1006);
    expect(response.status).toBe(200);
    expect(client.edited.at(-1)?.text).toContain(
      "Application deadline: 2026-09-30",
    );
  });

  test("contact button returns only the selected public contact field", async () => {
    const response = await callback("contact:phone", 1007);
    expect(response.status).toBe(200);
    expect(client.edited.at(-1)?.text).toBe("Phone\n\n+855 93 222 380");
    expect(client.edited.at(-1)?.text).not.toContain("admission@example.edu");
  });
});
