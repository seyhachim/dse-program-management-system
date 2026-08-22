import { Router, type Request } from "express";
import { purposeHmac } from "../../../core/security/public-abuse-protection.ts";
import { getTelegramConfig } from "../config.ts";
import {
  LANGUAGE_BUTTONS,
  isLanguageSwitch,
  languageSelectorMarkup,
  localeFromSelection,
  localizeBotText,
  localizeReplyMarkup,
  toEnglishReplyText,
  type TelegramLocale,
} from "./locale.ts";
import {
  createPublicTelegramRouter,
  type PublicTelegramRouterDependencies,
} from "./router.ts";
import {
  createTelegramPublicBotClient,
  type TelegramPublicBotClient,
} from "./telegram-client.ts";

const MAX_LOCALE_ENTRIES = 10_000;

class TelegramLocaleStore {
  private readonly values = new Map<string, TelegramLocale>();

  get(key: string): TelegramLocale | undefined {
    const value = this.values.get(key);
    if (value) {
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value;
  }

  set(key: string, locale: TelegramLocale): void {
    this.values.delete(key);
    this.values.set(key, locale);
    while (this.values.size > MAX_LOCALE_ENTRIES) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (!oldest) break;
      this.values.delete(oldest);
    }
  }

  delete(key: string): void {
    this.values.delete(key);
  }
}

const localeStore = new TelegramLocaleStore();

function chatIdFromBody(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const candidate = body as {
    message?: { chat?: { id?: unknown } };
    callback_query?: { message?: { chat?: { id?: unknown } } };
  };
  const value =
    candidate.message?.chat?.id ?? candidate.callback_query?.message?.chat?.id;
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function localeKey(webhookSecret: string, chatId: number): string {
  return purposeHmac(webhookSecret, "telegram-public-locale:v1", chatId);
}

function localeForChat(webhookSecret: string, chatId: number): TelegramLocale {
  return localeStore.get(localeKey(webhookSecret, chatId)) ?? "en";
}

function localizedClient(
  base: TelegramPublicBotClient,
  webhookSecret: string,
): TelegramPublicBotClient {
  function localeFor(chatId: number): TelegramLocale {
    return localeStore.get(localeKey(webhookSecret, chatId)) ?? "en";
  }

  return {
    async sendMessage(input) {
      const key = localeKey(webhookSecret, input.chatId);
      const selected = localeStore.get(key);
      if (
        !selected &&
        input.text.startsWith("Welcome to the DSE Program Information Bot")
      ) {
        await base.sendMessage({
          chatId: input.chatId,
          text: "សូមជ្រើសរើសភាសា / Choose your language",
          replyMarkup: languageSelectorMarkup(),
        });
        return;
      }
      const locale = selected ?? "en";
      await base.sendMessage({
        ...input,
        text: localizeBotText(input.text, locale),
        replyMarkup: localizeReplyMarkup(input.replyMarkup, locale),
      });
    },

    async editMessage(input) {
      const locale = localeFor(input.chatId);
      await base.editMessage({
        ...input,
        text: localizeBotText(input.text, locale),
        replyMarkup: localizeReplyMarkup(input.replyMarkup, locale),
      });
    },

    async answerCallbackQuery(input) {
      await base.answerCallbackQuery(input);
    },
  };
}

function preprocessLanguageSelection(
  req: Request,
  webhookSecret: string,
): void {
  if (req.method !== "POST" || req.path !== "/webhook") return;
  const chatId = chatIdFromBody(req.body);
  if (chatId === undefined) return;

  const message = (req.body as { message?: { text?: unknown } }).message;
  if (!message || typeof message.text !== "string") return;

  const selected = localeFromSelection(message.text);
  const key = localeKey(webhookSecret, chatId);
  if (selected) {
    localeStore.set(key, selected);
    message.text = "/menu";
    return;
  }

  if (isLanguageSwitch(message.text)) {
    localeStore.delete(key);
    message.text = "/start";
    return;
  }

  // Telegram keeps a reply keyboard on the device across backend deploys, while
  // this lightweight locale store is intentionally process-local. A known Khmer
  // keyboard label therefore carries enough presentation context to restore the
  // lost locale and route through the same canonical English RouteKey input.
  const normalizedReplyText = toEnglishReplyText(message.text);
  if (normalizedReplyText !== message.text) {
    localeStore.set(key, "km");
    message.text = normalizedReplyText;
    return;
  }

  if (localeStore.get(key) === "km") {
    message.text = normalizedReplyText;
  }
}

/**
 * Locale adapter around the existing typed public Telegram router.
 *
 * Routing/callback payloads, authorization, webhook verification, public PMS reads,
 * rate limiting and analytics remain owned by the existing router. This adapter
 * only localizes visible bot-owned text and maps localized reply-keyboard labels
 * back to the same English RouteKey inputs.
 *
 * Locale preference is intentionally lightweight and process-local. It is stored
 * only under a purpose-separated HMAC key, never under a raw Telegram identifier.
 * After a process restart, a tap on an existing Khmer reply keyboard safely
 * rehydrates Khmer presentation state; otherwise English remains the fallback.
 * No authorization decision depends on this preference.
 */
export function createLocalizedPublicTelegramRouter(
  deps: PublicTelegramRouterDependencies = {},
) {
  const config = deps.config ?? getTelegramConfig();
  if (!config.botToken || !config.webhookSecret) {
    return createPublicTelegramRouter({ ...deps, config });
  }

  const baseClient =
    deps.client ?? createTelegramPublicBotClient(config.botToken);
  const router = Router();
  router.use((req, _res, next) => {
    preprocessLanguageSelection(req, config.webhookSecret!);
    next();
  });
  router.use(
    createPublicTelegramRouter({
      ...deps,
      config,
      client: localizedClient(baseClient, config.webhookSecret),
      localeForChat:
        deps.localeForChat ??
        ((chatId) => localeForChat(config.webhookSecret!, chatId)),
    }),
  );
  return router;
}

export const TELEGRAM_PUBLIC_LANGUAGE_BUTTONS = LANGUAGE_BUTTONS;
