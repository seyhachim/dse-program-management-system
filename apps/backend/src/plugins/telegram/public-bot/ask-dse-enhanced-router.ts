import { AsyncLocalStorage } from "node:async_hooks";
import type {
  PublicProgrammeFaq,
  PublicProgrammeLocale,
} from "@dse-pms/shared-types";
import { publicProgrammeReadService } from "../../programme/public-programme-read-service.ts";
import {
  publicProgrammeSearchService,
  type PublicAskDseResult,
} from "../../programme/public-programme-search-service.ts";
import { getPublicTelegramConfig } from "../config.ts";
import { createProgressivePublicTelegramRouter } from "./progressive-curriculum-router.ts";
import type { PublicTelegramRouterDependencies } from "./router.ts";
import {
  createTelegramPublicBotClient,
  type TelegramPublicBotClient,
  type TelegramReplyMarkup,
} from "./telegram-client.ts";

const ASK_DSE_CALLBACK_PREFIX = "ux:ask:";
const TELEGRAM_CALLBACK_MAX_BYTES = 64;
const FAQ_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUTTON_TEXT_MAX_CHARS = 52;

type AskDsePresentationContext = {
  searchResult?: PublicAskDseResult;
  locale?: PublicProgrammeLocale;
  selectedFaqSlug?: string;
};

const presentationContext = new AsyncLocalStorage<AskDsePresentationContext>();

function callbackByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function buildAskDseFaqCallback(slug: string): string | undefined {
  const normalized = slug.trim().toLowerCase();
  const value = `${ASK_DSE_CALLBACK_PREFIX}${normalized}`;
  if (
    !FAQ_SLUG.test(normalized) ||
    callbackByteLength(value) > TELEGRAM_CALLBACK_MAX_BYTES
  ) {
    return undefined;
  }
  return value;
}

function parseAskDseFaqCallback(value: string): string | undefined {
  if (
    !value.startsWith(ASK_DSE_CALLBACK_PREFIX) ||
    callbackByteLength(value) > TELEGRAM_CALLBACK_MAX_BYTES
  ) {
    return undefined;
  }
  const slug = value.slice(ASK_DSE_CALLBACK_PREFIX.length);
  return FAQ_SLUG.test(slug) ? slug : undefined;
}

function compactButtonText(value: string): string {
  const chars = Array.from(value.trim());
  if (chars.length <= BUTTON_TEXT_MAX_CHARS) return value.trim();
  return `${chars.slice(0, BUTTON_TEXT_MAX_CHARS - 1).join("")}…`;
}

function hasKhmerText(value: string): boolean {
  return /[\u1780-\u17ff]/u.test(value);
}

function askHomeMarkup(locale: PublicProgrammeLocale): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: locale === "km" ? "❓ សួរ DSE" : "❓ Ask DSE",
          callback_data: "ask:start",
        },
        {
          text: locale === "km" ? "🏠 ទំព័រដើម" : "🏠 Home",
          callback_data: "nav:home",
        },
      ],
    ],
  };
}

function fallbackMarkup(locale: PublicProgrammeLocale): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: locale === "km" ? "📝 ការចូលរៀន" : "📝 Admission",
          callback_data: "admission:menu",
        },
        {
          text:
            locale === "km"
              ? "📚 កម្មវិធីសិក្សា"
              : "📚 Curriculum",
          callback_data: "curriculum:menu",
        },
      ],
      [
        {
          text: locale === "km" ? "💼 អាជីព" : "💼 Careers",
          callback_data: "careers:menu",
        },
        {
          text:
            locale === "km"
              ? "💰 ថ្លៃសិក្សា និងអាហារូបករណ៍"
              : "💰 Fees & Scholarships",
          callback_data: "fees:menu",
        },
      ],
      [
        {
          text: locale === "km" ? "❓ សួរ DSE" : "❓ Ask DSE",
          callback_data: "ask:start",
        },
        {
          text: locale === "km" ? "🏠 ទំព័រដើម" : "🏠 Home",
          callback_data: "nav:home",
        },
      ],
    ],
  };
}

function suggestionMarkup(
  result: Extract<PublicAskDseResult, { kind: "suggestions" }>,
  locale: PublicProgrammeLocale,
): TelegramReplyMarkup {
  const rows = result.suggestions.flatMap((suggestion) => {
    const callback = buildAskDseFaqCallback(suggestion.faq.slug);
    return callback
      ? [
          [
            {
              text: compactButtonText(suggestion.faq.question),
              callback_data: callback,
            },
          ],
        ]
      : [];
  });

  rows.push([
    {
      text: locale === "km" ? "❓ សួរ DSE" : "❓ Ask DSE",
      callback_data: "ask:start",
    },
    {
      text: locale === "km" ? "🏠 ទំព័រដើម" : "🏠 Home",
      callback_data: "nav:home",
    },
  ]);

  return { inline_keyboard: rows };
}

function formatPublishedFaq(
  faq: PublicProgrammeFaq,
  locale: PublicProgrammeLocale,
): string {
  const source = faq.sourceLabel?.trim();
  const sourceLine = source
    ? locale === "km"
      ? `\n\nប្រភព: ${source}`
      : `\n\nSource: ${source}`
    : "";
  const heading = locale === "km" ? "សួរ DSE" : "Ask DSE";
  return `${heading}\n\n${faq.question}\n\n${faq.shortAnswer || faq.answer}${sourceLine}`;
}

function formatSearchResult(
  result: PublicAskDseResult,
  locale: PublicProgrammeLocale,
): { text: string; replyMarkup: TelegramReplyMarkup } {
  if (result.kind === "answer") {
    return {
      text: formatPublishedFaq(result.faq, locale),
      replyMarkup: askHomeMarkup(locale),
    };
  }

  if (result.kind === "suggestions") {
    return {
      text:
        locale === "km"
          ? "សួរ DSE\n\nខ្ញុំរកឃើញសំណួរដែលអាចត្រូវ។ សូមចុចមួយខាងក្រោម៖"
          : "Ask DSE\n\nI found a few possible matches. Tap one below:",
      replyMarkup: suggestionMarkup(result, locale),
    };
  }

  return {
    text:
      locale === "km"
        ? "សួរ DSE\n\nខ្ញុំរកមិនឃើញចម្លើយដែលបានបញ្ជាក់ទេ។ សូមជ្រើសប្រធានបទខាងក្រោម ឬសរសេរសំណួររបស់អ្នកឱ្យជាក់លាក់ជាងមុន។"
        : "Ask DSE\n\nI couldn't find a confirmed answer. Try one of these topics or rephrase your question.",
    replyMarkup: fallbackMarkup(locale),
  };
}

function enhancedClient(
  base: TelegramPublicBotClient,
  resolveFaq: (
    slug: string,
    locale: PublicProgrammeLocale,
  ) => Promise<PublicProgrammeFaq>,
): TelegramPublicBotClient {
  return {
    async sendMessage(input) {
      const context = presentationContext.getStore();
      if (!context?.searchResult) {
        await base.sendMessage(input);
        return;
      }

      const locale = context.locale === "km" ? "km" : "en";
      await base.sendMessage({
        ...input,
        ...formatSearchResult(context.searchResult, locale),
      });
    },

    async editMessage(input) {
      const context = presentationContext.getStore();
      if (!context?.selectedFaqSlug) {
        await base.editMessage(input);
        return;
      }

      const locale: PublicProgrammeLocale = hasKhmerText(input.text)
        ? "km"
        : "en";
      try {
        const faq = await resolveFaq(context.selectedFaqSlug, locale);
        await base.editMessage({
          ...input,
          text: formatPublishedFaq(faq, locale),
          replyMarkup: askHomeMarkup(locale),
        });
      } catch {
        await base.editMessage({
          ...input,
          text:
            locale === "km"
              ? "សួរ DSE\n\nព័ត៌មាននេះមិនមានទៀតទេ។ សូមជ្រើសប្រធានបទផ្សេង ឬសួរសំណួរថ្មី។"
              : "Ask DSE\n\nThat published answer is no longer available. Choose another topic or ask a new question.",
          replyMarkup: fallbackMarkup(locale),
        });
      }
    },

    async answerCallbackQuery(input) {
      await base.answerCallbackQuery(input);
    },
  };
}

function preprocessAskDsePresentation(
  req: { method?: string; path?: string; body?: unknown },
): AskDsePresentationContext {
  if (req.method !== "POST" || req.path !== "/webhook") return {};
  if (!req.body || typeof req.body !== "object") return {};

  const body = req.body as {
    callback_query?: { data?: unknown };
  };
  const data = body.callback_query?.data;
  if (typeof data !== "string") return {};

  const slug = parseAskDseFaqCallback(data);
  if (!slug) return {};

  // Reuse the authenticated/rate-limited base callback path. The presentation
  // client replaces the generic FAQ-list render with the selected published FAQ.
  body.callback_query!.data = "faq:popular";
  return { selectedFaqSlug: slug };
}

/**
 * Enhances Ask DSE presentation while preserving the existing public Telegram
 * security, rate limiting, analytics, curriculum navigation and data boundaries.
 *
 * - ambiguous searches become tappable FAQ suggestions;
 * - strong matches render concise published answers;
 * - no-match searches show useful topic fallbacks;
 * - suggestion taps still pass through the existing validated callback pipeline.
 */
export function createEnhancedPublicTelegramRouter(
  deps: PublicTelegramRouterDependencies = {},
) {
  const config = deps.config ?? getPublicTelegramConfig();
  if (!config.botToken || !config.webhookSecret) {
    return createProgressivePublicTelegramRouter({ ...deps, config });
  }

  const baseClient =
    deps.client ?? createTelegramPublicBotClient(config.botToken);
  const baseSearch = deps.publicSearch ?? publicProgrammeSearchService;
  const resolveFaq = async (
    slug: string,
    locale: PublicProgrammeLocale,
  ): Promise<PublicProgrammeFaq> => {
    if (deps.publicRead?.getFaqBySlug) {
      return deps.publicRead.getFaqBySlug(
        config.publicProgrammeId,
        slug,
        locale,
      );
    }
    return publicProgrammeReadService.getFaqBySlug(
      config.publicProgrammeId,
      slug,
      locale,
    );
  };

  const wrappedSearch = {
    async search(
      programmeId: string,
      question: string,
      locale: PublicProgrammeLocale = "en",
    ) {
      const result = await baseSearch.search(programmeId, question, locale);
      const context = presentationContext.getStore();
      if (context) {
        context.searchResult = result;
        context.locale = locale;
      }
      return result;
    },
  };

  const router = createProgressivePublicTelegramRouter({
    ...deps,
    config,
    publicSearch: wrappedSearch,
    client: enhancedClient(baseClient, resolveFaq),
  });

  const outer = (await import("express")).Router();
  outer.use((req, _res, next) => {
    const context = preprocessAskDsePresentation(req);
    presentationContext.run(context, next);
  });
  outer.use(router);
  return outer;
}
