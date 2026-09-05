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
  PublicProgrammeLocale,
  PublicProgrammeProfile,
} from "@dse-pms/shared-types";
import { registry } from "../../../core/plugins/registry.ts";
import {
  getPublicAbuseProtectionConfig,
  publicAbuseRateLimiter,
  purposeHmac,
  type PublicAbuseProtectionConfig,
  type RateLimiter,
} from "../../../core/security/public-abuse-protection.ts";
import {
  PublicCurriculumConflictError,
  PublicCurriculumNotFoundError,
  type PublicCurriculumCourse,
  type PublicCurriculumReadService,
  type PublicCurriculumStudyPlan,
  type PublicCurriculumTotals,
} from "../../programme/public-curriculum-read-service.ts";
import type {
  PublicAskDseResult,
  PublicProgrammeSearchService,
} from "../../programme/public-programme-search-service.ts";
import { publicProgrammeSearchService } from "../../programme/public-programme-search-service.ts";
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
import { createPublicTelegramTimingTracker } from "./performance.ts";
import {
  createTelegramPublicBotClient,
  type TelegramPublicBotClient,
  type TelegramReplyMarkup,
} from "./telegram-client.ts";

const MAX_CALLBACK_DATA_BYTES = 64;

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
  getProgramme(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeProfile>;
  listFaqs(
    programmeId: string,
    filters?: {
      category?: ProgrammeFaqCategory;
      featured?: boolean;
      locale?: PublicProgrammeLocale;
    },
  ): Promise<PublicProgrammeFaq[]>;
  getFaqBySlug?(
    programmeId: string,
    slug: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeFaq>;
  getAdmission(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeAdmission>;
  getFeesScholarships(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeFeesScholarships>;
  listImportantDates(
    programmeId: string,
    filters?: { kind?: string; locale?: PublicProgrammeLocale },
  ): Promise<PublicProgrammeImportantDate[]>;
  getContact(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeContact>;
};

type PublicQuestionAnalyticsObserver = {
  observeAskDse(input: {
    programmeId: string;
    source: "Telegram";
    questionText: string;
    result: PublicAskDseResult;
    answerDelivered: boolean;
    sourceEventKey?: string | null;
    analyticsActorHash?: string | null;
  }): Promise<unknown>;
};

type ProgrammeRegistryService = {
  publicRead: PublicReadService;
  publicCurriculumRead: PublicCurriculumReadService;
  publicQuestionAnalytics: PublicQuestionAnalyticsObserver;
};

export interface PublicTelegramRouterDependencies {
  config?: TelegramConfig;
  client?: TelegramPublicBotClient;
  publicRead?: PublicReadService;
  publicCurriculumRead?: PublicCurriculumReadService;
  publicSearch?: PublicProgrammeSearchService;
  publicQuestionAnalytics?: PublicQuestionAnalyticsObserver;
  abuseConfig?: PublicAbuseProtectionConfig;
  rateLimiter?: RateLimiter;
  now?: () => number;
  localeForChat?: (chatId: number) => PublicProgrammeLocale;
}

const CALLBACK_ROUTE = new Map<string, RouteKey>(
  Object.entries(ROUTE_CALLBACKS).map(([route, callback]) => [
    callback,
    route as RouteKey,
  ]),
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

const FAQ_SLUG_BY_CALLBACK: Record<string, string> = {
  "about:what_is_dse": "what-is-dse",
  "about:why_dse": "why-dse",
  "about:what_learn": "what-will-i-study",
  "about:duration": "programme-duration",
  "about:who_should_join": "who-should-join-dse",
  "about:vs_cs": "dse-vs-computer-science",
  "about:vs_it": "dse-vs-information-technology",
  "admission:eligibility": "admission-eligibility",
  "admission:requirements": "admission-requirements",
  "admission:how_to_apply": "how-to-apply",
  "admission:documents": "admission-documents",
  "admission:exam": "entrance-exam",
  "admission:english": "english-requirement",
  "admission:programming": "programming-requirement",
  "admission:math": "mathematics-requirement",
  "curriculum:overview": "what-will-i-study",
  "curriculum:topic:programming": "curriculum-programming",
  "curriculum:topic:data": "curriculum-data",
  "curriculum:topic:ai_ml": "curriculum-ai-ml",
  "curriculum:topic:math": "curriculum-math-statistics",
  "curriculum:projects": "curriculum-projects",
  "curriculum:internship": "curriculum-internship",
  "curriculum:final_project": "final-year-options",
  "careers:jobs": "career-opportunities",
  "careers:explorer": "career-opportunities",
  "career:data_analyst": "career-data-analyst",
  "career:data_scientist": "career-data-scientist",
  "career:ml_engineer": "career-ml-engineer",
  "career:data_engineer": "career-data-engineer",
  "career:software_engineer": "career-software-engineer",
  "career:bi_analyst": "career-bi-analyst",
  "career:research": "career-research",
  "career:government": "career-government",
  "career:agritech": "career-agritech",
  "fees:tuition": "tuition-fee",
  "fees:other_costs": "other-study-costs",
  "fees:payment_schedule": "payment-schedule",
  "fees:support": "financial-support",
  "scholarships:available": "scholarships-available",
  "scholarships:eligibility": "scholarship-eligibility",
  "scholarships:apply": "scholarship-how-to-apply",
  "scholarships:deadline": "scholarship-deadline",
  "studentlife:experience": "student-life-experience",
  "studentlife:projects": "student-life-projects",
  "studentlife:internships": "student-life-internships",
  "studentlife:clubs": "student-life-clubs",
  "studentlife:competitions": "student-life-competitions",
  "studentlife:workload": "student-life-workload",
  "studentlife:team_projects": "student-life-team-projects",
  "studentlife:support": "student-life-support",
  "facility:computer_labs": "facility-computer-labs",
  "facility:data_computing": "facility-data-computing-lab",
  "facility:smart_agriculture": "facility-smart-agriculture-systems-lab",
  "facility:software": "facility-software-tools",
  "facility:research": "facility-research",
  "lecturers:leadership": "programme-leadership",
  "lecturers:list:1": "lecturers",
  "lecturers:expertise": "lecturer-expertise",
  "lecturers:research": "lecturer-research",
  "fit:q1:programming": "fit-programming",
  "fit:q1:data": "fit-data-numbers",
  "fit:q1:ai": "fit-ai-technology",
  "fit:q1:research": "fit-research",
  "fit:q1:unsure": "fit-not-sure",
  "fit:q2:love": "fit-math-love",
  "fit:q2:okay": "fit-math-okay",
  "fit:q2:difficult": "fit-math-difficult",
  "fit:q3:yes": "fit-programming-yes",
  "fit:q3:little": "fit-programming-little",
  "fit:q3:never": "fit-programming-never",
};

const DATE_KIND_BY_CALLBACK: Record<string, string> = {
  "dates:application_open": "ApplicationOpen",
  "dates:application_deadline": "ApplicationDeadline",
  "dates:exam": "EntranceExam",
  "dates:interview": "Interview",
  "dates:results": "Results",
  "dates:registration": "Registration",
  "dates:semester_start": "SemesterStart",
};

function secureEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function replyKeyboard(): TelegramReplyMarkup {
  return {
    keyboard: MAIN_REPLY_KEYBOARD.map((row) =>
      row.map((button) => ({ text: button.text })),
    ),
    resize_keyboard: true,
    is_persistent: true,
  };
}

function inlineKeyboard(route: RouteKey): TelegramReplyMarkup {
  const toButton = (button: InlineButton) =>
    button.type === "callback"
      ? { text: button.text, callback_data: button.callbackData }
      : { text: button.text, url: button.url };
  return {
    inline_keyboard: getMenuKeyboard(route).map((row) => row.map(toButton)),
  };
}

function resolveProgrammeService(): ProgrammeRegistryService {
  return registry.get<ProgrammeRegistryService>("programme").service;
}

async function observeAskDseBestEffort(
  analytics: PublicQuestionAnalyticsObserver,
  input: Parameters<PublicQuestionAnalyticsObserver["observeAskDse"]>[0],
): Promise<void> {
  try {
    await analytics.observeAskDse(input);
  } catch {
    console.error("Public Ask DSE analytics failed");
  }
}

function formatFaq(faq: PublicProgrammeFaq): string {
  return `${faq.question}\n\n${faq.shortAnswer || faq.answer}`;
}

function formatMissingPublishedTopic(slug: string): string {
  return `DSE Information\n\nNo published information is available yet for “${slug.replaceAll("-", " ")}”.`;
}

function formatMenu(title: string): string {
  return `${title}\n\nChoose an option below.`;
}

function formatFaqQuestions(title: string, faqs: PublicProgrammeFaq[]): string {
  if (!faqs.length)
    return `${title}\n\nNo published information is available yet.`;
  const questions = faqs.slice(0, 8).map((faq) => `• ${faq.question}`);
  return `${title}\n\n${questions.join("\n")}\n\nType one of these questions directly, or choose a topic below.`;
}

function formatDates(dates: PublicProgrammeImportantDate[]): string {
  if (!dates.length)
    return "Important Dates\n\nNo official published dates are available yet.";
  return `Important Dates\n\n${dates
    .slice(0, 10)
    .map((item) => {
      const range = item.endDate ? `${item.date} – ${item.endDate}` : item.date;
      return `• ${item.title}: ${range}${item.description ? `\n${item.description}` : ""}`;
    })
    .join("\n\n")}`;
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

function formatCourse(course: PublicCurriculumCourse): string {
  const hours =
    course.weeklyHoursTotal === null
      ? "Weekly hours: not available in the published source"
      : `Weekly hours: ${course.weeklyHoursTotal} (${course.weeklyLectureHours ?? 0} lecture + ${course.weeklyLabHours ?? 0} lab + ${course.weeklyFieldVisitHours ?? 0} field)`;
  const lines = [
    `${course.code} · ${course.title}`,
    `Year ${course.yearLevel}, Semester ${course.semester === "First" ? 1 : 2}`,
    `Credits: ${course.credits}`,
    hours,
    course.lecturerText ? `Lecturer(s): ${course.lecturerText}` : null,
    course.conflicts.length
      ? `⚠️ Source conflict: ${course.conflicts.join("; ")}`
      : null,
    `Source: approved curriculum v${course.provenance.curriculumVersion}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatCourseList(courses: PublicCurriculumCourse[]): string {
  if (!courses.length)
    return "Courses\n\nNo published curriculum courses are available yet.";
  const lines = courses
    .slice(0, 40)
    .map(
      (course) => `• ${course.code} — ${course.title} (${course.credits} cr)`,
    );
  const suffix =
    courses.length > 40
      ? `\n\nShowing 40 of ${courses.length} courses. Ask for a course code for details.`
      : "";
  return `Courses · Published Curriculum\n\n${lines.join("\n")}${suffix}`;
}

function formatStudyPlan(plan: PublicCurriculumStudyPlan): string {
  const heading = `Year ${plan.yearLevel} · Semester ${plan.semester === "First" ? 1 : 2}`;
  const lines = plan.courses.map((course) => {
    const hours =
      course.weeklyHoursTotal === null
        ? "hours n/a"
        : `${course.weeklyHoursTotal} h/wk`;
    return `• ${course.code} — ${course.title} · ${course.credits} cr · ${hours}`;
  });
  const totalHours =
    plan.totalWeeklyHours === null
      ? "weekly hours incomplete"
      : `${plan.totalWeeklyHours} h/week`;
  return `${heading}\n\n${lines.join("\n")}\n\nTotal: ${plan.totalCredits} credits · ${totalHours}\nSource: approved curriculum v${plan.provenance.curriculumVersion}`;
}

function formatTotals(totals: PublicCurriculumTotals): string {
  const hours =
    totals.totalWeeklyHours === null
      ? "not fully available"
      : `${totals.totalWeeklyHours}`;
  const breakdown = totals.byYearSemester.map((row) => {
    const rowHours =
      row.weeklyHours === null ? "hours n/a" : `${row.weeklyHours} h/wk`;
    const rowConflict =
      row.declaredCredits !== null &&
      row.declaredCredits !== row.computedCredits
        ? ` (rows sum ${row.computedCredits})`
        : "";
    return `• Year ${row.yearLevel} Sem ${row.semester === "First" ? 1 : 2}: ${row.courseCount} courses · ${row.credits} credits${rowConflict} · ${rowHours}`;
  });
  const conflictNote = totals.conflicts.length
    ? `\n⚠️ Source conflict: ${totals.conflicts.join("; ")}`
    : "";
  return `Programme Study Load\n\n${breakdown.join("\n")}\n\nPublished route total: ${totals.totalCourses} courses · ${totals.totalCredits} credits · weekly hours ${hours}${conflictNote}\nSource: approved curriculum v${totals.provenance.curriculumVersion}`;
}

function formatAskDse(result: PublicAskDseResult): string {
  if (result.kind === "answer") {
    return `Ask DSE\n\n${result.faq.question}\n${result.faq.shortAnswer || result.faq.answer}`;
  }
  if (result.kind === "suggestions") {
    return `Ask DSE · Possible matches\n\n${result.suggestions.map((item) => `• ${item.faq.question}`).join("\n")}\n\nPlease ask one of these more specifically.`;
  }
  return "I couldn't find a confirmed answer in the published DSE information. Try a more specific question, /courses, or choose a topic from the menu.";
}

async function sendCourseLookup(
  client: TelegramPublicBotClient,
  chatId: number,
  publicCurriculumRead: PublicCurriculumReadService,
  programmeId: string,
  query: string,
) {
  try {
    await client.sendMessage({
      chatId,
      text: formatCourse(
        await publicCurriculumRead.getCourse(programmeId, query),
      ),
      replyMarkup: replyKeyboard(),
    });
  } catch (error) {
    if (error instanceof PublicCurriculumNotFoundError) {
      await client.sendMessage({
        chatId,
        text: `I couldn't find “${query}” in the published DSE curriculum. Try /courses or a more specific course code/title.`,
        replyMarkup: replyKeyboard(),
      });
      return;
    }
    if (error instanceof PublicCurriculumConflictError) {
      await client.sendMessage({
        chatId,
        text: `“${query}” matches more than one published course. Please use a specific course code or a more exact title.`,
        replyMarkup: replyKeyboard(),
      });
      return;
    }
    throw error;
  }
}

async function renderRoute(
  route: RouteKey,
  programmeId: string,
  publicRead: PublicReadService,
  locale: PublicProgrammeLocale = "en",
): Promise<{ text: string; replyMarkup: TelegramReplyMarkup }> {
  if (route === "home") {
    return {
      text: "Welcome to DSE 👋\n\nLearn about Data Science and Engineering or ask about the programme.",
      replyMarkup: inlineKeyboard("home"),
    };
  }
  if (
    route === "admission" ||
    route === "fees" ||
    route === "scholarships" ||
    route === "about" ||
    route === "curriculum" ||
    route === "careers" ||
    route === "studentLife" ||
    route === "facilities" ||
    route === "lecturers"
  ) {
    return {
      text: formatMenu(MENUS[route].title),
      replyMarkup: inlineKeyboard(route),
    };
  }
  if (route === "dates") {
    return {
      text: formatDates(
        await publicRead.listImportantDates(programmeId, { locale }),
      ),
      replyMarkup: inlineKeyboard(route),
    };
  }
  if (route === "contact") {
    return {
      text: formatContact(await publicRead.getContact(programmeId, locale)),
      replyMarkup: inlineKeyboard(route),
    };
  }
  if (route === "ask") {
    return {
      text: `${formatMenu("Ask DSE")}\n\nYou can also type a question directly.`,
      replyMarkup: inlineKeyboard(route),
    };
  }
  return {
    text: formatMenu(MENUS[route].title),
    replyMarkup: inlineKeyboard(route),
  };
}

function callbackParentRoute(data: string): RouteKey {
  if (data.startsWith("about:")) return "about";
  if (data.startsWith("admission:")) return "admission";
  if (data.startsWith("curriculum:")) return "curriculum";
  if (data.startsWith("career")) return "careers";
  if (data.startsWith("fees:") || data.startsWith("scholarships:")) return "fees";
  if (data.startsWith("studentlife:")) return "studentLife";
  if (data.startsWith("facility:")) return "facilities";
  if (data.startsWith("lecturers:")) return "lecturers";
  if (data.startsWith("dates:")) return "dates";
  if (data.startsWith("contact:")) return "contact";
  if (data.startsWith("fit:")) return "fit";
  return "home";
}

async function renderStaticCallback(
  data: string,
  programmeId: string,
  publicRead: PublicReadService,
  publicCurriculumRead: PublicCurriculumReadService,
  locale: PublicProgrammeLocale = "en",
): Promise<{ text: string; replyMarkup: TelegramReplyMarkup }> {
  const route = CALLBACK_ROUTE.get(data);
  if (route) return renderRoute(route, programmeId, publicRead, locale);

  if (data === "faq:popular") {
    return {
      text: formatFaqQuestions(
        "Popular Questions",
        await publicRead.listFaqs(programmeId, { featured: true, locale }),
      ),
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
      text: formatFaqQuestions(
        "DSE Information",
        await publicRead.listFaqs(programmeId, {
          category: explicitCategory,
          locale,
        }),
      ),
      replyMarkup: inlineKeyboard("ask"),
    };
  }

  if (data === "curriculum:courses:page:1") {
    return {
      text: formatCourseList(await publicCurriculumRead.listCourses(programmeId)),
      replyMarkup: inlineKeyboard("curriculum"),
    };
  }

  const yearMatch = data.match(/^curriculum:year:([1-4])$/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    const [first, second] = await Promise.all([
      publicCurriculumRead.getStudyPlan(programmeId, year, "First"),
      publicCurriculumRead.getStudyPlan(programmeId, year, "Second"),
    ]);
    return {
      text: `${formatStudyPlan(first)}\n\n${formatStudyPlan(second)}`,
      replyMarkup: inlineKeyboard("curriculum"),
    };
  }

  const faqSlug = FAQ_SLUG_BY_CALLBACK[data];
  if (faqSlug && publicRead.getFaqBySlug) {
    try {
      return {
        text: formatFaq(
          await publicRead.getFaqBySlug(programmeId, faqSlug, locale),
        ),
        replyMarkup: inlineKeyboard(callbackParentRoute(data)),
      };
    } catch {
      return {
        text: formatMissingPublishedTopic(faqSlug),
        replyMarkup: inlineKeyboard(callbackParentRoute(data)),
      };
    }
  }

  const dateKind = DATE_KIND_BY_CALLBACK[data];
  if (dateKind) {
    return {
      text: formatDates(
        await publicRead.listImportantDates(programmeId, {
          kind: dateKind,
          locale,
        }),
      ),
      replyMarkup: inlineKeyboard("dates"),
    };
  }

  if (data.startsWith("contact:")) {
    const contact = await publicRead.getContact(programmeId, locale);
    const selected: Record<string, { label: string; value: string | null | undefined }> = {
      "contact:location": { label: "Location", value: contact.campusAddress },
      "contact:phone": { label: "Phone", value: contact.phone },
      "contact:email": { label: "Email", value: contact.admissionEmail },
      "contact:website": { label: "Website", value: contact.websiteUrl },
      "contact:admissions": {
        label: "Admissions contact",
        value: contact.applicationUrl ?? contact.admissionEmail ?? contact.phone,
      },
    };
    const item = selected[data];
    return {
      text: item?.value
        ? `${item.label}\n\n${item.value}`
        : `${item?.label ?? "Contact"}\n\nNo published information is available yet.`,
      replyMarkup: inlineKeyboard("contact"),
    };
  }

  const category = CATEGORY_BY_PREFIX.find(([prefix]) =>
    data.startsWith(prefix),
  )?.[1];
  if (category) {
    const routeForCategory: RouteKey =
      category === "About"
        ? "about"
        : category === "Admission"
          ? "admission"
          : category === "Curriculum"
            ? "curriculum"
            : category === "Careers"
              ? "careers"
              : category === "FeesScholarships"
                ? "fees"
                : category === "StudentLife"
                  ? "studentLife"
                  : category === "Facilities"
                    ? "facilities"
                    : "lecturers";
    return {
      text: formatMenu(MENUS[routeForCategory].title),
      replyMarkup: inlineKeyboard(routeForCategory),
    };
  }

  if (data.startsWith("explore:")) {
    const step = data.match(/^explore:step:([1-5])$/)?.[1];
    const routeKey = step ? (`explore.step${step}` as RouteKey) : "explore";
    return renderRoute(routeKey, programmeId, publicRead, locale);
  }
  if (data.startsWith("fit:")) {
    return {
      text: formatMissingPublishedTopic(FAQ_SLUG_BY_CALLBACK[data] ?? "dse-suitability-guide"),
      replyMarkup: inlineKeyboard("fit"),
    };
  }
  return renderRoute("home", programmeId, publicRead, locale);
}

function parseStudyPlanQuestion(
  text: string,
): { year: number; semester: "First" | "Second" } | null {
  const match =
    text.match(/\byear\s*([1-4])\b.*\bsem(?:ester)?\s*([12])\b/i) ??
    text.match(/\byear\s*([1-4])\b.*\b(first|second)\s+semester\b/i);
  if (!match) return null;
  const year = Number(match[1]);
  const semesterToken = match[2]?.toLocaleLowerCase();
  return {
    year,
    semester:
      semesterToken === "1" || semesterToken === "first" ? "First" : "Second",
  };
}

export function createPublicTelegramRouter(
  deps: PublicTelegramRouterDependencies = {},
): Router {
  const router = Router();
  const abuseConfig = deps.abuseConfig ?? getPublicAbuseProtectionConfig();
  const rateLimiter = deps.rateLimiter ?? publicAbuseRateLimiter;
  const now = deps.now ?? Date.now;

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

    const contentLength = Number(req.get("content-length") ?? 0);
    const serializedBytes = Buffer.byteLength(
      JSON.stringify(req.body ?? null),
      "utf8",
    );
    if (
      (Number.isFinite(contentLength) &&
        contentLength > abuseConfig.telegramMaxUpdateBytes) ||
      serializedBytes > abuseConfig.telegramMaxUpdateBytes
    ) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const parsed = TelegramUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const update = parsed.data;
    const globalAdmission = rateLimiter.check(
      "telegram:update:global",
      abuseConfig.telegramGlobalUpdateMax,
      abuseConfig.telegramWindowMs,
      now(),
    );
    if (!globalAdmission.allowed) {
      res.setHeader("Retry-After", String(globalAdmission.retryAfterSeconds));
      res.status(200).json({ ok: true, rateLimited: true });
      return;
    }

    const actorId =
      update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (actorId !== undefined) {
      const actorAdmission = rateLimiter.check(
        purposeHmac(
          config.webhookSecret,
          "telegram-rate-limit:actor:v1",
          actorId,
        ),
        abuseConfig.telegramActorUpdateMax,
        abuseConfig.telegramWindowMs,
        now(),
      );
      if (!actorAdmission.allowed) {
        res.setHeader("Retry-After", String(actorAdmission.retryAfterSeconds));
        res.status(200).json({ ok: true, rateLimited: true });
        return;
      }
    }

    if (update.callback_query && actorId !== undefined) {
      const callbackAdmission = rateLimiter.check(
        purposeHmac(
          config.webhookSecret,
          "telegram-rate-limit:callback:v1",
          actorId,
        ),
        abuseConfig.telegramCallbackMax,
        abuseConfig.telegramWindowMs,
        now(),
      );
      if (!callbackAdmission.allowed) {
        res.setHeader(
          "Retry-After",
          String(callbackAdmission.retryAfterSeconds),
        );
        res.status(200).json({ ok: true, rateLimited: true });
        return;
      }
    }

    const timing = createPublicTelegramTimingTracker(
      update.callback_query ? "callback" : update.message ? "message" : "other",
    );
    const baseClient =
      deps.client ?? createTelegramPublicBotClient(config.botToken);
    const programmeService =
      deps.publicRead &&
      deps.publicCurriculumRead &&
      deps.publicQuestionAnalytics
        ? null
        : resolveProgrammeService();
    const basePublicRead = deps.publicRead ?? programmeService!.publicRead;
    const basePublicCurriculumRead =
      deps.publicCurriculumRead ?? programmeService!.publicCurriculumRead;
    const basePublicSearch = deps.publicSearch ?? publicProgrammeSearchService;
    const client = timing.wrapTelegramClient(baseClient);
    const publicRead = timing.wrapPmsService(basePublicRead);
    const publicCurriculumRead = timing.wrapPmsService(
      basePublicCurriculumRead,
    );
    const publicSearch = timing.wrapPmsService(basePublicSearch);
    const publicQuestionAnalytics =
      deps.publicQuestionAnalytics ?? programmeService!.publicQuestionAnalytics;
    const programmeId = config.publicProgrammeId;
    const locale =
      actorId === undefined ? "en" : (deps.localeForChat?.(actorId) ?? "en");
    let timingOutcome: "ok" | "error" = "ok";

    try {
      if (update.message?.text) {
        const text = update.message.text.trim();
        if (text === "/start" || text === "/menu") {
          await client.sendMessage({
            chatId: update.message.chat.id,
            text: "Welcome to the DSE Program Information Bot 👋\n\nChoose a topic below, type /courses, or type /ask for public DSE questions.",
            replyMarkup: replyKeyboard(),
          });
        } else if (text === "/ask") {
          const rendered = await renderRoute(
            "ask",
            programmeId,
            publicRead,
            locale,
          );
          await client.sendMessage({
            chatId: update.message.chat.id,
            ...rendered,
          });
        } else if (text === "/courses") {
          await client.sendMessage({
            chatId: update.message.chat.id,
            text: formatCourseList(
              await publicCurriculumRead.listCourses(programmeId),
            ),
            replyMarkup: replyKeyboard(),
          });
        } else if (/^\/course\s+\S+/i.test(text)) {
          const query = text.replace(/^\/course\s+/i, "").trim();
          await sendCourseLookup(
            client,
            update.message.chat.id,
            publicCurriculumRead,
            programmeId,
            query,
          );
        } else {
          const studyPlan = parseStudyPlanQuestion(text);
          const looksLikeCourseCode = /^[A-Z]{2,5}\d{3}$/i.test(text);
          const coursePhrase = text
            .match(/^(?:tell me about|course)\s+(.+)$/i)?.[1]
            ?.trim();
          if (studyPlan) {
            await client.sendMessage({
              chatId: update.message.chat.id,
              text: formatStudyPlan(
                await publicCurriculumRead.getStudyPlan(
                  programmeId,
                  studyPlan.year,
                  studyPlan.semester,
                ),
              ),
              replyMarkup: replyKeyboard(),
            });
          } else if (
            /\b(?:credit load|credits|hours per week|weekly hours)\b/i.test(
              text,
            )
          ) {
            await client.sendMessage({
              chatId: update.message.chat.id,
              text: formatTotals(
                await publicCurriculumRead.getTotals(programmeId),
              ),
              replyMarkup: replyKeyboard(),
            });
          } else if (looksLikeCourseCode || coursePhrase) {
            await sendCourseLookup(
              client,
              update.message.chat.id,
              publicCurriculumRead,
              programmeId,
              coursePhrase ?? text,
            );
          } else {
            const route = routeForReplyText(text);
            if (route) {
              const rendered = await renderRoute(
                route,
                programmeId,
                publicRead,
                locale,
              );
              await client.sendMessage({
                chatId: update.message.chat.id,
                ...rendered,
              });
            } else {
              const askAdmission = rateLimiter.check(
                purposeHmac(
                  config.webhookSecret,
                  "telegram-rate-limit:ask-dse:v1",
                  update.message.chat.id,
                ),
                abuseConfig.telegramAskDseMax,
                abuseConfig.telegramWindowMs,
                now(),
              );
              if (!askAdmission.allowed) {
                res.setHeader(
                  "Retry-After",
                  String(askAdmission.retryAfterSeconds),
                );
                res.status(200).json({ ok: true, rateLimited: true });
                return;
              }

              const searchResult = await publicSearch.search(
                programmeId,
                text,
                locale,
              );
              let delivered = false;
              try {
                await client.sendMessage({
                  chatId: update.message.chat.id,
                  text: formatAskDse(searchResult),
                  replyMarkup: replyKeyboard(),
                });
                delivered = true;
              } finally {
                await observeAskDseBestEffort(publicQuestionAnalytics, {
                  programmeId,
                  source: "Telegram",
                  questionText: text,
                  result: searchResult,
                  answerDelivered: delivered,
                  sourceEventKey: purposeHmac(
                    config.webhookSecret,
                    "ask-dse-analytics-event:v1",
                    update.update_id,
                  ),
                  analyticsActorHash: purposeHmac(
                    config.webhookSecret,
                    "ask-dse-analytics-actor:v1",
                    update.message.chat.id,
                  ),
                });
              }
            }
          }
        }
      } else if (update.callback_query) {
        const callback = update.callback_query;
        const callbackTooLarge = callback.data
          ? Buffer.byteLength(callback.data, "utf8") > MAX_CALLBACK_DATA_BYTES
          : false;
        const parsedCallback =
          callback.data && !callbackTooLarge
            ? parseCallbackData(callback.data)
            : null;
        if (!parsedCallback || !callback.message) {
          await client.answerCallbackQuery({
            callbackQueryId: callback.id,
            text: "This action is unavailable.",
          });
        } else {
          // Telegram's client keeps a visible waiting state until the callback is
          // acknowledged. Do this before any PMS read/render work so a slow DB or
          // message edit does not make a valid button tap feel unresponsive.
          await client.answerCallbackQuery({ callbackQueryId: callback.id });

          let rendered;
          if (parsedCallback.kind === "static") {
            rendered = await renderStaticCallback(
              parsedCallback.data,
              programmeId,
              publicRead,
              publicCurriculumRead,
              locale,
            );
          } else if (parsedCallback.kind === "course") {
            try {
              rendered = {
                text: formatCourse(
                  await publicCurriculumRead.getCourse(
                    programmeId,
                    parsedCallback.code,
                  ),
                ),
                replyMarkup: inlineKeyboard("curriculum"),
              };
            } catch {
              rendered = {
                text: formatMenu(MENUS.curriculum.title),
                replyMarkup: inlineKeyboard("curriculum"),
              };
            }
          } else {
            rendered = {
              text: formatMenu(MENUS.lecturers.title),
              replyMarkup: inlineKeyboard("lecturers"),
            };
          }
          await client.editMessage({
            chatId: callback.message.chat.id,
            messageId: callback.message.message_id,
            ...rendered,
          });
        }
      }
      res.json({ ok: true });
    } catch (error) {
      timingOutcome = "error";
      console.error("Public Telegram webhook failed", error);
      res.status(500).json({ error: "Could not process Telegram update" });
    } finally {
      timing.finish(timingOutcome);
    }
  });

  return router;
}
