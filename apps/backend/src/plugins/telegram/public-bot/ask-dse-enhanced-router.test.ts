import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { PublicProgrammeLocale } from "@dse-pms/shared-types";
import type { TelegramConfig } from "../config.ts";
import { createEnhancedPublicTelegramRouter } from "./ask-dse-enhanced-router.ts";
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
  webhookSecret: "ask-dse-secret",
  publicProgrammeId: "dse",
  initDataMaxAgeSeconds: 300,
  initDataMaxFutureSkewSeconds: 30,
};

function faq(
  slug: string,
  question: string,
  answer: string,
  category: "Admission" | "Curriculum" | "Careers" | "FeesScholarships" =
    "Admission",
) {
  return {
    slug,
    category,
    question,
    answer,
    shortAnswer: answer,
    isFeatured: true,
    sourceLabel: "DSE PMS",
    sourceUrl: null,
  };
}

const scholarshipFaqEn = faq(
  "scholarships-available",
  "Are scholarships available?",
  "Yes. Published scholarship opportunities are listed by DSE.",
  "FeesScholarships",
);
const deadlineFaqEn = faq(
  "scholarship-deadline",
  "When is the scholarship deadline?",
  "Use the published scholarship deadline shown by DSE.",
  "FeesScholarships",
);
const programmingFaqEn = faq(
  "programming-experience",
  "Do I need programming experience before I study DSE?",
  "Programming experience is helpful but not required.",
  "Admission",
);

const scholarshipFaqKm = faq(
  "scholarships-available",
  "តើមានអាហារូបករណ៍ទេ?",
  "មាន។ DSE បង្ហាញអាហារូបករណ៍ដែលបានផ្សព្វផ្សាយ។",
  "FeesScholarships",
);
const deadlineFaqKm = faq(
  "scholarship-deadline",
  "ថ្ងៃផុតកំណត់អាហារូបករណ៍នៅពេលណា?",
  "សូមមើលថ្ងៃផុតកំណត់ដែល DSE បានផ្សព្វផ្សាយ។",
  "FeesScholarships",
);

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

  async listFaqs(
    _programmeId: string,
    filters?: { category?: string; featured?: boolean; locale?: PublicProgrammeLocale },
  ) {
    const items = filters?.locale === "km"
      ? [scholarshipFaqKm, deadlineFaqKm]
      : [scholarshipFaqEn, deadlineFaqEn, programmingFaqEn];
    if (!filters?.category) return items;
    return items.filter((item) => item.category === filters.category);
  },

  async getFaqBySlug(
    _programmeId: string,
    slug: string,
    locale?: PublicProgrammeLocale,
  ) {
    const items = locale === "km"
      ? [scholarshipFaqKm, deadlineFaqKm]
      : [scholarshipFaqEn, deadlineFaqEn, programmingFaqEn];
    const match = items.find((item) => item.slug === slug);
    if (!match) throw new Error("not found");
    return match;
  },

  async getAdmission() {
    return {
      applicationUrl: null,
      admissionEmail: "admission@example.edu",
      phone: null,
      faqs: [programmingFaqEn],
    };
  },

  async getFeesScholarships() {
    return { faqs: [scholarshipFaqEn, deadlineFaqEn] };
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

const publicSearch = {
  async search(
    _programmeId: string,
    question: string,
    locale: PublicProgrammeLocale = "en",
  ) {
    if (/python|programming/i.test(question)) {
      return {
        kind: "answer" as const,
        faq: programmingFaqEn,
        score: 93,
      };
    }
    if (/scholarship/i.test(question) || /អាហារូបករណ៍/u.test(question)) {
      return {
        kind: "suggestions" as const,
        suggestions:
          locale === "km"
            ? [
                { faq: scholarshipFaqKm, score: 66 },
                { faq: deadlineFaqKm, score: 58 },
              ]
            : [
                { faq: scholarshipFaqEn, score: 66 },
                { faq: deadlineFaqEn, score: 58 },
              ],
      };
    }
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
    createEnhancedPublicTelegramRouter({
      config,
      client,
      publicRead,
      publicCurriculumRead,
      publicSearch,
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

function inlineButtons(markup: TelegramSendMessageInput["replyMarkup"]) {
  if (!markup || !("inline_keyboard" in markup)) return [];
  return markup.inline_keyboard.flat();
}

describe("enhanced Ask DSE Telegram flow", () => {
  test("ambiguous search returns tappable FAQ suggestions", async () => {
    const response = await webhook({
      update_id: 1001,
      message: {
        message_id: 1,
        chat: { id: 8101 },
        text: "scholarship",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toBe(
      "Ask DSE\n\nI found a few possible matches. Tap one below:",
    );
    const buttons = inlineButtons(sent.replyMarkup);
    expect(buttons.map((button) => button.text)).toContain(
      "Are scholarships available?",
    );
    expect(buttons.map((button) => button.text)).toContain(
      "When is the scholarship deadline?",
    );
    expect(
      buttons.flatMap((button) =>
        "callback_data" in button ? [button.callback_data] : [],
      ),
    ).toContain("ux:ask:scholarships-available");
  });

  test("tapping a suggestion opens that one published answer", async () => {
    const response = await webhook({
      update_id: 1002,
      callback_query: {
        id: "cb-ask-1",
        data: "ux:ask:scholarship-deadline",
        message: { message_id: 44, chat: { id: 8101 } },
      },
    });

    expect(response.status).toBe(200);
    const edited = client.edited.at(-1)!;
    expect(edited.messageId).toBe(44);
    expect(edited.text).toContain("When is the scholarship deadline?");
    expect(edited.text).toContain(
      "Use the published scholarship deadline shown by DSE.",
    );
    expect(edited.text).not.toContain("Are scholarships available?");
    expect(client.answered.at(-1)).toEqual({ callbackQueryId: "cb-ask-1" });
  });

  test("strong search match renders a concise published answer", async () => {
    const response = await webhook({
      update_id: 1003,
      message: {
        message_id: 3,
        chat: { id: 8102 },
        text: "do I need python?",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain(
      "Do I need programming experience before I study DSE?",
    );
    expect(sent.text).toContain(
      "Programming experience is helpful but not required.",
    );
    expect(sent.text).toContain("Source: DSE PMS");
    const callbacks = inlineButtons(sent.replyMarkup).flatMap((button) =>
      "callback_data" in button ? [button.callback_data] : [],
    );
    expect(callbacks).toEqual(["ask:start", "nav:home"]);
  });

  test("no-match search provides useful fallback topics", async () => {
    const response = await webhook({
      update_id: 1004,
      message: {
        message_id: 4,
        chat: { id: 8103 },
        text: "today football score",
      },
    });

    expect(response.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("couldn't find a confirmed answer");
    const callbacks = inlineButtons(sent.replyMarkup).flatMap((button) =>
      "callback_data" in button ? [button.callback_data] : [],
    );
    expect(callbacks).toContain("admission:menu");
    expect(callbacks).toContain("curriculum:menu");
    expect(callbacks).toContain("careers:menu");
    expect(callbacks).toContain("fees:menu");
    expect(callbacks).toContain("ask:start");
    expect(callbacks).toContain("nav:home");
  });

  test("Khmer Ask DSE suggestions and selected answer stay Khmer", async () => {
    await webhook({
      update_id: 1005,
      message: {
        message_id: 5,
        chat: { id: 8104 },
        text: "/start",
      },
    });
    await webhook({
      update_id: 1006,
      message: {
        message_id: 6,
        chat: { id: 8104 },
        text: "🇰🇭 ភាសាខ្មែរ",
      },
    });

    const searchResponse = await webhook({
      update_id: 1007,
      message: {
        message_id: 7,
        chat: { id: 8104 },
        text: "អាហារូបករណ៍",
      },
    });
    expect(searchResponse.status).toBe(200);
    const sent = client.sent.at(-1)!;
    expect(sent.text).toContain("ខ្ញុំរកឃើញសំណួរដែលអាចត្រូវ");
    expect(inlineButtons(sent.replyMarkup).map((button) => button.text)).toContain(
      "តើមានអាហារូបករណ៍ទេ?",
    );

    const callbackResponse = await webhook({
      update_id: 1008,
      callback_query: {
        id: "cb-ask-km",
        data: "ux:ask:scholarships-available",
        message: { message_id: 55, chat: { id: 8104 } },
      },
    });
    expect(callbackResponse.status).toBe(200);
    const edited = client.edited.at(-1)!;
    expect(edited.text).toContain("តើមានអាហារូបករណ៍ទេ?");
    expect(edited.text).toContain(
      "DSE បង្ហាញអាហារូបករណ៍ដែលបានផ្សព្វផ្សាយ។",
    );
    expect(edited.text).toContain("ប្រភព: DSE PMS");
  });

  test("malformed custom suggestion callback still fails closed", async () => {
    const editsBefore = client.edited.length;
    const response = await webhook({
      update_id: 1009,
      callback_query: {
        id: "cb-ask-bad",
        data: "ux:ask:BAD SLUG",
        message: { message_id: 56, chat: { id: 8105 } },
      },
    });

    expect(response.status).toBe(200);
    expect(client.edited.length).toBe(editsBefore);
    expect(client.answered.at(-1)?.text).toBe("This action is unavailable.");
  });
});
