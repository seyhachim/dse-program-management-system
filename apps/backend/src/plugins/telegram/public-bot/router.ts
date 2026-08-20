import { timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import type {
  ProgrammeFaqCategory,
  PublicProgrammeAdmission,
  PublicProgrammeContact,
  PublicProgrammeFaq,
  PublicProgrammeFeesScholarships,
  PublicProgrammeImportantDate,
  PublicProgrammeProfile,
} from "@dse-pms/shared-types";
import { registry } from "../../../core/plugins/registry.ts";
import { getTelegramConfig, type TelegramConfig } from "../config.ts";
import {
  MAIN_REPLY_KEYBOARD,
  MENUS,
  ROUTE_CALLBACKS,
  getMenuKeyboard,
  parseCallbackData,
  routeForReplyText,
  type InlineButton,
  type RouteKey,
} from "./index.ts";
import {
  createTelegramPublicBotClient,
  type TelegramPublicBotClient,
  type TelegramReplyMarkup,
} from "./telegram-client.ts";

const TelegramMessageSchema = z.object({
  message_id: z.number().int(),
  chat: z.object({ id: z.number().int() }),
  text: z.string().optional(),
});

const TelegramCallbackSchema = z.object({
  id: z.string().min(1),
  data: z.string().optional(),
  message: TelegramMessageSchema.optional(),
});

const TelegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: TelegramMessageSchema.optional(),
  callback_query: TelegramCallbackSchema.optional(),
});

type PublicReadService = {
  getProgramme(programmeId: string): Promise<PublicProgrammeProfile>;
  listFaqs(programmeId: string, filters?: { category?: ProgrammeFaqCategory; featured?: boolean }): Promise<PublicProgrammeFaq[]>;
  getAdmission(programmeId: string): Promise<PublicProgrammeAdmission>;
  getFeesScholarships(programmeId: string): Promise<PublicProgrammeFeesScholarships>;
  listImportantDates(programmeId: string): Promise<PublicProgrammeImportantDate[]>;
  getContact(programmeId: string): Promise<PublicProgrammeContact>;
};

type ProgrammeRegistryService = { publicRead: PublicReadService };

export interface PublicTelegramRouterDependencies {
  config?: TelegramConfig;
  client?: TelegramPublicBotClient;
  publicRead?: PublicReadService;
}

const CALLBACK_ROUTE = new Map<string, RouteKey>(
  Object.entries(ROUTE_CALLBACKS).map(([route, callback]) => [callback, route as RouteKey]),
);

const CATEGORY_BY_PREFIX: Array<[string, ProgrammeFaqCategory]> = [
  ["about:", "About"],
  ["admission:", "Admission"],
  ["curriculum:", "Curriculum"],
  ["careers:", "Careers"],
  ["career:", "Careers"],
  ["fees:", "FeesScholarships"],
  ["scholarships:", "FeesScholarships"],
  ["studentlife:", "StudentLife"],
  ["facility:", "Facilities"],
  ["lecturers:", "Lecturers"],
  ["lecturer:", "Lecturers"],
];

function secureEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function replyKeyboard(): TelegramReplyMarkup {
  return {
    keyboard: MAIN_REPLY_KEYBOARD.map((row) => row.map((button) => ({ text: button.text }))),
    resize_keyboard: true,
    is_persistent: true,
  };
}

function inlineKeyboard(route: RouteKey): TelegramReplyMarkup {
  const toButton = (button: InlineButton) =>
    button.type === "callback"
      ? { text: button.text, callback_data: button.callbackData }
      : { text: button.text, url: button.url };
  return { inline_keyboard: getMenuKeyboard(route).map((row) => row.map(toButton)) };
}

function resolvePublicRead(): PublicReadService {
  return registry.get<ProgrammeRegistryService>("programme").service.publicRead;
}

function formatFaqs(title: string, faqs: PublicProgrammeFaq[]): string {
  if (!faqs.length) return `${title}\n\nNo published information is available yet.`;
  const items = faqs.slice(0, 8).map((faq) => `• ${faq.question}\n${faq.shortAnswer || faq.answer}`);
  return `${title}\n\n${items.join("\n\n")}`;
}

function formatDates(dates: PublicProgrammeImportantDate[]): string {
  if (!dates.length) return "Important Dates\n\nNo official published dates are available yet.";
  return `Important Dates\n\n${dates.slice(0, 10).map((item) => {
    const range = item.endDate ? `${item.date} – ${item.endDate}` : item.date;
    return `• ${item.title}: ${range}${item.description ? `\n${item.description}` : ""}`;
  }).join("\n\n")}`;
}

function formatContact(contact: PublicProgrammeContact): string {
  const lines = [
    contact.campusAddress && `Location: ${contact.campusAddress}`,
    contact.phone && `Phone: ${contact.phone}`,
    contact.admissionEmail && `Email: ${contact.admissionEmail}`,
    contact.websiteUrl && `Website: ${contact.websiteUrl}`,
    contact.facebookUrl && `Facebook: ${contact.facebookUrl}`,
    contact.applicationUrl && `Apply: ${contact.applicationUrl}`,
  ].filter(Boolean);
  return `Contact Us\n\n${lines.length ? lines.join("\n") : "No published contact information is available yet."}`;
}

async function renderRoute(
  route: RouteKey,
  programmeId: string,
  publicRead: PublicReadService,
): Promise<{ text: string; replyMarkup: TelegramReplyMarkup }> {
  if (route === "home") {
    return {
      text: "Welcome to DSE 👋\n\nLearn about Data Science and Engineering or ask about the programme.",
      replyMarkup: inlineKeyboard("home"),
    };
  }
  if (route === "admission") {
    const admission = await publicRead.getAdmission(programmeId);
    const details = [
      admission.applicationUrl && `Apply: ${admission.applicationUrl}`,
      admission.admissionEmail && `Email: ${admission.admissionEmail}`,
      admission.phone && `Phone: ${admission.phone}`,
    ].filter(Boolean);
    return {
      text: `${formatFaqs("Admission", admission.faqs)}${details.length ? `\n\n${details.join("\n")}` : ""}`,
      replyMarkup: inlineKeyboard(route),
    };
  }
  if (route === "fees" || route === "scholarships") {
    const data = await publicRead.getFeesScholarships(programmeId);
    return { text: formatFaqs("Fees & Scholarships", data.faqs), replyMarkup: inlineKeyboard(route) };
  }
  if (route === "dates") {
    return { text: formatDates(await publicRead.listImportantDates(programmeId)), replyMarkup: inlineKeyboard(route) };
  }
  if (route === "contact") {
    return { text: formatContact(await publicRead.getContact(programmeId)), replyMarkup: inlineKeyboard(route) };
  }
  if (route === "ask") {
    const faqs = await publicRead.listFaqs(programmeId, { featured: true });
    return {
      text: `${formatFaqs("Ask DSE · Popular Questions", faqs)}\n\nYou can also choose a topic below.`,
      replyMarkup: inlineKeyboard(route),
    };
  }
  const categoryByRoute: Partial<Record<RouteKey, ProgrammeFaqCategory>> = {
    about: "About",
    curriculum: "Curriculum",
    careers: "Careers",
    studentLife: "StudentLife",
    facilities: "Facilities",
    lecturers: "Lecturers",
  };
  const category = categoryByRoute[route];
  if (category) {
    return {
      text: formatFaqs(MENUS[route].title, await publicRead.listFaqs(programmeId, { category })),
      replyMarkup: inlineKeyboard(route),
    };
  }
  return { text: `${MENUS[route].title}\n\nChoose an option below.`, replyMarkup: inlineKeyboard(route) };
}

async function renderStaticCallback(
  data: string,
  programmeId: string,
  publicRead: PublicReadService,
): Promise<{ text: string; replyMarkup: TelegramReplyMarkup }> {
  const route = CALLBACK_ROUTE.get(data);
  if (route) return renderRoute(route, programmeId, publicRead);

  if (data === "faq:popular") {
    return {
      text: formatFaqs("Popular Questions", await publicRead.listFaqs(programmeId, { featured: true })),
      replyMarkup: inlineKeyboard("ask"),
    };
  }
  const faqCategoryCallbacks: Record<string, ProgrammeFaqCategory> = {
    "faq:category:admission": "Admission",
    "faq:category:curriculum": "Curriculum",
    "faq:category:careers": "Careers",
    "faq:category:fees": "FeesScholarships",
  };
  const explicitCategory = faqCategoryCallbacks[data];
  if (explicitCategory) {
    return {
      text: formatFaqs("DSE Information", await publicRead.listFaqs(programmeId, { category: explicitCategory })),
      replyMarkup: inlineKeyboard("ask"),
    };
  }
  if (data.startsWith("dates:")) {
    return { text: formatDates(await publicRead.listImportantDates(programmeId)), replyMarkup: inlineKeyboard("dates") };
  }
  if (data.startsWith("contact:")) {
    return { text: formatContact(await publicRead.getContact(programmeId)), replyMarkup: inlineKeyboard("contact") };
  }
  const category = CATEGORY_BY_PREFIX.find(([prefix]) => data.startsWith(prefix))?.[1];
  if (category) {
    const routeForCategory: RouteKey = category === "About" ? "about"
      : category === "Admission" ? "admission"
      : category === "Curriculum" ? "curriculum"
      : category === "Careers" ? "careers"
      : category === "FeesScholarships" ? "fees"
      : category === "StudentLife" ? "studentLife"
      : category === "Facilities" ? "facilities"
      : "lecturers";
    return {
      text: formatFaqs(MENUS[routeForCategory].title, await publicRead.listFaqs(programmeId, { category })),
      replyMarkup: inlineKeyboard(routeForCategory),
    };
  }
  if (data.startsWith("explore:")) {
    const step = data.match(/^explore:step:([1-5])$/)?.[1];
    const routeKey = step ? (`explore.step${step}` as RouteKey) : "explore";
    return renderRoute(routeKey, programmeId, publicRead);
  }
  if (data.startsWith("fit:")) return renderRoute("fit", programmeId, publicRead);
  return renderRoute("home", programmeId, publicRead);
}

export function createPublicTelegramRouter(
  deps: PublicTelegramRouterDependencies = {},
): Router {
  const router = Router();

  router.post("/webhook", async (req: Request, res) => {
    const config = deps.config ?? getTelegramConfig();
    if (!config.enabled || !config.botToken || !config.webhookSecret) {
      res.status(503).json({ error: "Public Telegram bot is not configured" });
      return;
    }
    const header = req.get("x-telegram-bot-api-secret-token");
    if (!secureEqual(header, config.webhookSecret)) {
      res.status(401).json({ error: "Invalid Telegram webhook secret" });
      return;
    }

    const parsed = TelegramUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const client = deps.client ?? createTelegramPublicBotClient(config.botToken);
    const publicRead = deps.publicRead ?? resolvePublicRead();
    const programmeId = config.publicProgrammeId;

    try {
      const update = parsed.data;
      if (update.message?.text) {
        const text = update.message.text.trim();
        if (text === "/start" || text === "/menu") {
          await client.sendMessage({
            chatId: update.message.chat.id,
            text: "Welcome to the DSE Program Information Bot 👋\n\nChoose a topic below or type /ask for public DSE questions.",
            replyMarkup: replyKeyboard(),
          });
        } else if (text === "/ask") {
          const rendered = await renderRoute("ask", programmeId, publicRead);
          await client.sendMessage({ chatId: update.message.chat.id, ...rendered });
        } else {
          const route = routeForReplyText(text);
          if (route) {
            const rendered = await renderRoute(route, programmeId, publicRead);
            await client.sendMessage({ chatId: update.message.chat.id, ...rendered });
          } else {
            await client.sendMessage({
              chatId: update.message.chat.id,
              text: "I couldn't match that to a confirmed DSE topic yet. Choose a menu item or use /ask.",
              replyMarkup: replyKeyboard(),
            });
          }
        }
      } else if (update.callback_query) {
        const callback = update.callback_query;
        const parsedCallback = callback.data ? parseCallbackData(callback.data) : null;
        if (!parsedCallback || !callback.message) {
          await client.answerCallbackQuery({ callbackQueryId: callback.id, text: "This action is unavailable." });
        } else {
          let rendered;
          if (parsedCallback.kind === "static") {
            rendered = await renderStaticCallback(parsedCallback.data, programmeId, publicRead);
          } else {
            const category: ProgrammeFaqCategory = parsedCallback.kind === "course" ? "Curriculum" : "Lecturers";
            rendered = {
              text: formatFaqs("DSE Information", await publicRead.listFaqs(programmeId, { category })),
              replyMarkup: inlineKeyboard(parsedCallback.kind === "course" ? "curriculum" : "lecturers"),
            };
          }
          await client.editMessage({
            chatId: callback.message.chat.id,
            messageId: callback.message.message_id,
            ...rendered,
          });
          await client.answerCallbackQuery({ callbackQueryId: callback.id });
        }
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Public Telegram webhook failed", error);
      res.status(500).json({ error: "Could not process Telegram update" });
    }
  });

  return router;
}
