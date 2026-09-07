import { Router, type Request } from "express";
import { purposeHmac } from "../../../core/security/public-abuse-protection.ts";
import { getPublicTelegramConfig } from "../config.ts";
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
  type TelegramReplyMarkup,
} from "./telegram-client.ts";

const MAX_LOCALE_ENTRIES = 10_000;
const MAX_CHAT_CONTEXT_ENTRIES = 10_000;
const GROUP_START_PAYLOAD = "dse_group";
const GROUP_LAUNCHER_TEXT =
  "🎓 DSE Information Board\n\nសូមបើកបូតឯកជន ដើម្បីស្វែងយល់ព័ត៌មានកម្មវិធី DSE ដោយមិនរំខានក្រុម។\nOpen the private DSE information bot to browse without cluttering this group.";

type TelegramChatType = "private" | "group" | "supergroup" | "channel";

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

class TelegramChatContextStore {
  private readonly values = new Map<string, TelegramChatType>();

  get(key: string): TelegramChatType | undefined {
    const value = this.values.get(key);
    if (value) {
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value;
  }

  set(key: string, type: TelegramChatType): void {
    this.values.delete(key);
    this.values.set(key, type);
    while (this.values.size > MAX_CHAT_CONTEXT_ENTRIES) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (!oldest) break;
      this.values.delete(oldest);
    }
  }
}

const localeStore = new TelegramLocaleStore();
const chatContextStore = new TelegramChatContextStore();

function chatContextFromBody(
  body: unknown,
): { chatId: number; type?: TelegramChatType } | undefined {
  if (!body || typeof body !== "object") return undefined;
  const candidate = body as {
    message?: { chat?: { id?: unknown; type?: unknown } };
    callback_query?: {
      message?: { chat?: { id?: unknown; type?: unknown } };
    };
  };
  const chat = candidate.message?.chat ?? candidate.callback_query?.message?.chat;
  const value = chat?.id;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  const type = chat?.type;
  return {
    chatId: value,
    type:
      type === "private" ||
      type === "group" ||
      type === "supergroup" ||
      type === "channel"
        ? type
        : undefined,
  };
}

function localeKey(webhookSecret: string, chatId: number): string {
  return purposeHmac(webhookSecret, "telegram-public-locale:v1", chatId);
}

function chatContextKey(webhookSecret: string, chatId: number): string {
  return purposeHmac(webhookSecret, "telegram-public-chat-context:v1", chatId);
}

function localeForChat(webhookSecret: string, chatId: number): TelegramLocale {
  return localeStore.get(localeKey(webhookSecret, chatId)) ?? "en";
}

function isGroupChat(type: TelegramChatType | undefined): boolean {
  return type === "group" || type === "supergroup";
}

function normalizeBotUsername(botUsername: string | undefined): string | undefined {
  const normalized = botUsername?.trim().replace(/^@/, "");
  return normalized || undefined;
}

function parseTelegramCommand(
  text: string,
): { name: string; target?: string; argument?: string } | null {
  const match = text
    .trim()
    .match(/^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+(.+))?$/i);
  if (!match) return null;
  return {
    name: match[1]!.toLowerCase(),
    target: match[2]?.toLowerCase(),
    argument: match[3]?.trim(),
  };
}

function commandTargetsBot(
  target: string | undefined,
  botUsername: string | undefined,
): boolean {
  if (!target) return true;
  const normalized = normalizeBotUsername(botUsername)?.toLowerCase();
  return Boolean(normalized && target === normalized);
}

function isGroupLauncherCommand(
  text: string,
  botUsername: string | undefined,
): boolean {
  const command = parseTelegramCommand(text);
  if (!command || !commandTargetsBot(command.target, botUsername)) return false;
  return command.name === "start" || command.name === "dse";
}

function isPrivateGroupDeepLink(
  text: string,
  botUsername: string | undefined,
): boolean {
  const command = parseTelegramCommand(text);
  return Boolean(
    command &&
      command.name === "start" &&
      commandTargetsBot(command.target, botUsername) &&
      command.argument === GROUP_START_PAYLOAD,
  );
}

function buildGroupLauncherMarkup(
  botUsername: string | undefined,
): TelegramReplyMarkup | undefined {
  const normalized = normalizeBotUsername(botUsername);
  if (!normalized) return undefined;
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 Open DSE Information Board",
          url: `https://t.me/${normalized}?start=${GROUP_START_PAYLOAD}`,
        },
      ],
    ],
  };
}

function localizedClient(
  base: TelegramPublicBotClient,
  webhookSecret: string,
  botUsername: string | undefined,
): TelegramPublicBotClient {
  function localeFor(chatId: number): TelegramLocale {
    return localeStore.get(localeKey(webhookSecret, chatId)) ?? "en";
  }

  function isKnownGroup(chatId: number): boolean {
    return isGroupChat(
      chatContextStore.get(chatContextKey(webhookSecret, chatId)),
    );
  }

  return {
    async sendMessage(input) {
      if (
        isKnownGroup(input.chatId) &&
        input.text.startsWith("Welcome to the DSE Program Information Bot")
      ) {
        await base.sendMessage({
          chatId: input.chatId,
          text: GROUP_LAUNCHER_TEXT,
          replyMarkup: buildGroupLauncherMarkup(botUsername),
        });
        return;
      }

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

function preprocessTelegramPresentation(
  req: Request,
  webhookSecret: string,
  botUsername: string | undefined,
): void {
  if (req.method !== "POST" || req.path !== "/webhook") return;
  const context = chatContextFromBody(req.body);
  if (!context) return;

  if (context.type) {
    chatContextStore.set(
      chatContextKey(webhookSecret, context.chatId),
      context.type,
    );
  }

  const body = req.body as {
    message?: { text?: unknown };
    callback_query?: { data?: unknown };
  };

  if (isGroupChat(context.type)) {
    if (body.callback_query) {
      delete body.callback_query.data;
      return;
    }

    const groupMessage = body.message;
    if (!groupMessage || typeof groupMessage.text !== "string") return;
    if (isGroupLauncherCommand(groupMessage.text, botUsername)) {
      groupMessage.text = "/start";
    } else {
      // Keep group traffic out of the interactive information/search flow. The
      // authenticated base webhook still receives the update, applies its normal
      // abuse/rate limits, and acknowledges it without invoking Ask DSE.
      delete groupMessage.text;
    }
    return;
  }

  const message = body.message;
  if (!message || typeof message.text !== "string") return;

  if (isPrivateGroupDeepLink(message.text, botUsername)) {
    message.text = "/start";
  }

  const selected = localeFromSelection(message.text);
  const key = localeKey(webhookSecret, context.chatId);
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
  // keyboard label therefore carries enough presentation context to restore a
  // missing locale and route through the same canonical English RouteKey input.
  // If the user explicitly selected English, keep that preference while still
  // normalizing the stale Khmer keyboard label for typed routing.
  const storedLocale = localeStore.get(key);
  const normalizedReplyText = toEnglishReplyText(message.text);
  if (normalizedReplyText !== message.text) {
    if (!storedLocale) localeStore.set(key, "km");
    message.text = normalizedReplyText;
    return;
  }

  if (storedLocale === "km") {
    message.text = normalizedReplyText;
  }
}

/**
 * Presentation adapter around the existing typed public Telegram router.
 *
 * Routing/callback payloads, authorization, webhook verification, public PMS reads,
 * rate limiting and analytics remain owned by the existing router. This adapter
 * localizes visible bot-owned text, maps localized reply-keyboard labels back to
 * canonical RouteKey inputs, and keeps public group chats as launcher-only entry
 * points into the private information bot.
 *
 * Locale and chat-presentation state is intentionally lightweight and process-local.
 * It is stored only under purpose-separated HMAC keys, never under raw Telegram
 * identifiers. No authorization decision depends on locale or chat presentation.
 */
export function createLocalizedPublicTelegramRouter(
  deps: PublicTelegramRouterDependencies = {},
) {
  const config = deps.config ?? getPublicTelegramConfig();
  if (!config.botToken || !config.webhookSecret) {
    return createPublicTelegramRouter({ ...deps, config });
  }

  const baseClient =
    deps.client ?? createTelegramPublicBotClient(config.botToken);
  const router = Router();
  router.use((req, _res, next) => {
    preprocessTelegramPresentation(
      req,
      config.webhookSecret!,
      config.botUsername,
    );
    next();
  });
  router.use(
    createPublicTelegramRouter({
      ...deps,
      config,
      client: localizedClient(
        baseClient,
        config.webhookSecret,
        config.botUsername,
      ),
      localeForChat:
        deps.localeForChat ??
        ((chatId) => localeForChat(config.webhookSecret!, chatId)),
    }),
  );
  return router;
}

export const TELEGRAM_PUBLIC_LANGUAGE_BUTTONS = LANGUAGE_BUTTONS;
