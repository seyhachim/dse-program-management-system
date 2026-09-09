import { AsyncLocalStorage } from "node:async_hooks";
import { Router, type Request } from "express";
import { getPublicTelegramConfig } from "../config.ts";
import {
  createLocalizedPublicTelegramRouter,
} from "./localized-router.ts";
import {
  createTelegramPublicBotClient,
  type TelegramPublicBotClient,
  type TelegramReplyMarkup,
} from "./telegram-client.ts";
import type { PublicTelegramRouterDependencies } from "./router.ts";

type CurriculumYear = 1 | 2 | 3 | 4;
type CurriculumSemester = 1 | 2;

type CurriculumPresentationContext = {
  year?: CurriculumYear;
  semester?: CurriculumSemester;
};

const presentationContext =
  new AsyncLocalStorage<CurriculumPresentationContext>();

function asCurriculumYear(value: string): CurriculumYear | undefined {
  const year = Number(value);
  return year >= 1 && year <= 4 ? (year as CurriculumYear) : undefined;
}

function asCurriculumSemester(value: string): CurriculumSemester | undefined {
  return value === "1" || value === "2"
    ? (Number(value) as CurriculumSemester)
    : undefined;
}

function parseYearCallback(data: string): CurriculumYear | undefined {
  const match = data.match(/^curriculum:year:([1-4])$/);
  return match ? asCurriculumYear(match[1]!) : undefined;
}

function parseSemesterCallback(
  data: string,
): { year: CurriculumYear; semester: CurriculumSemester } | undefined {
  const match = data.match(/^ux:curriculum:([1-4]):([12])$/);
  if (!match) return undefined;
  const year = asCurriculumYear(match[1]!);
  const semester = asCurriculumSemester(match[2]!);
  return year && semester ? { year, semester } : undefined;
}

function isKhmerStudyPlan(text: string, year: CurriculumYear): boolean {
  return (
    text.includes(`ឆ្នាំទី ${year} · ឆមាសទី 1`) ||
    text.includes(`ឆ្នាំទី ${year} · ឆមាសទី 2`) ||
    text.includes("ប្រភព: កម្មវិធីសិក្សាអនុម័ត")
  );
}

function yearSelectorMarkup(
  year: CurriculumYear,
  khmer: boolean,
): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: khmer ? "📘 ឆមាសទី 1" : "📘 Semester 1",
          callback_data: `ux:curriculum:${year}:1`,
        },
        {
          text: khmer ? "📗 ឆមាសទី 2" : "📗 Semester 2",
          callback_data: `ux:curriculum:${year}:2`,
        },
      ],
      [
        {
          text: khmer ? "← ត្រឡប់ក្រោយ" : "← Back",
          callback_data: "curriculum:menu",
        },
        {
          text: khmer ? "🏠 ទំព័រដើម" : "🏠 Home",
          callback_data: "nav:home",
        },
      ],
    ],
  };
}

function semesterNavigationMarkup(
  year: CurriculumYear,
  khmer: boolean,
): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: khmer ? "← ត្រឡប់ក្រោយ" : "← Back",
          callback_data: `curriculum:year:${year}`,
        },
        {
          text: khmer ? "🏠 ទំព័រដើម" : "🏠 Home",
          callback_data: "nav:home",
        },
      ],
    ],
  };
}

function markerIndex(text: string, markers: string[]): number {
  const positions = markers
    .map((marker) => text.indexOf(marker))
    .filter((position) => position >= 0);
  return positions.length ? Math.min(...positions) : -1;
}

function selectedSemesterText(
  text: string,
  year: CurriculumYear,
  semester: CurriculumSemester,
  khmer: boolean,
): string {
  const firstMarkers = [
    `Year ${year} · Semester 1`,
    `ឆ្នាំទី ${year} · ឆមាសទី 1`,
  ];
  const secondMarkers = [
    `Year ${year} · Semester 2`,
    `ឆ្នាំទី ${year} · ឆមាសទី 2`,
  ];
  const firstStart = markerIndex(text, firstMarkers);
  const secondStart = markerIndex(text, secondMarkers);

  let selected = text;
  if (semester === 1 && firstStart >= 0 && secondStart > firstStart) {
    selected = text.slice(firstStart, secondStart).trim();
  } else if (semester === 2 && secondStart >= 0) {
    selected = text.slice(secondStart).trim();
  }

  if (khmer) {
    selected = selected
      .replace(
        new RegExp(`^Year ${year} · Semester 1`),
        `ឆ្នាំទី ${year} · ឆមាសទី 1`,
      )
      .replace(
        new RegExp(`^Year ${year} · Semester 2`),
        `ឆ្នាំទី ${year} · ឆមាសទី 2`,
      );
  }
  return selected;
}

function progressiveClient(
  base: TelegramPublicBotClient,
): TelegramPublicBotClient {
  return {
    async sendMessage(input) {
      await base.sendMessage(input);
    },

    async editMessage(input) {
      const context = presentationContext.getStore();
      const year = context?.year;
      if (!year) {
        await base.editMessage(input);
        return;
      }

      const khmer = isKhmerStudyPlan(input.text, year);
      if (!context.semester) {
        await base.editMessage({
          ...input,
          text: khmer
            ? `📚 ឆ្នាំទី ${year}\n\nសូមជ្រើសរើសឆមាស។`
            : `📚 Year ${year}\n\nChoose a semester.`,
          replyMarkup: yearSelectorMarkup(year, khmer),
        });
        return;
      }

      await base.editMessage({
        ...input,
        text: selectedSemesterText(
          input.text,
          year,
          context.semester,
          khmer,
        ),
        replyMarkup: semesterNavigationMarkup(year, khmer),
      });
    },

    async answerCallbackQuery(input) {
      await base.answerCallbackQuery(input);
    },
  };
}

function preprocessCurriculumPresentation(
  req: Request,
): CurriculumPresentationContext {
  if (req.method !== "POST" || req.path !== "/webhook") return {};
  if (!req.body || typeof req.body !== "object") return {};

  const body = req.body as {
    callback_query?: { data?: unknown };
  };
  const data = body.callback_query?.data;
  if (typeof data !== "string") return {};

  const selected = parseSemesterCallback(data);
  if (selected) {
    body.callback_query!.data = `curriculum:year:${selected.year}`;
    return selected;
  }

  const year = parseYearCallback(data);
  return year ? { year } : {};
}

/**
 * Adds progressive disclosure to the public curriculum browser without changing
 * curriculum data or the typed public Telegram router contract. A year tap first
 * renders a semester chooser; only the selected semester is then shown.
 */
export function createProgressivePublicTelegramRouter(
  deps: PublicTelegramRouterDependencies = {},
) {
  const config = deps.config ?? getPublicTelegramConfig();
  if (!config.botToken || !config.webhookSecret) {
    return createLocalizedPublicTelegramRouter({ ...deps, config });
  }

  const baseClient =
    deps.client ?? createTelegramPublicBotClient(config.botToken);
  const router = Router();

  router.use((req, _res, next) => {
    const context = preprocessCurriculumPresentation(req);
    presentationContext.run(context, next);
  });
  router.use(
    createLocalizedPublicTelegramRouter({
      ...deps,
      config,
      client: progressiveClient(baseClient),
    }),
  );
  return router;
}
