export type TelegramReplyMarkup =
  | {
      keyboard: Array<Array<{ text: string }>>;
      resize_keyboard: true;
      is_persistent: true;
    }
  | {
      inline_keyboard: Array<
        Array<
          | { text: string; callback_data: string }
          | { text: string; url: string }
        >
      >;
    };

export interface TelegramSendMessageInput {
  chatId: number;
  text: string;
  replyMarkup?: TelegramReplyMarkup;
}

export interface TelegramEditMessageInput {
  chatId: number;
  messageId: number;
  text: string;
  replyMarkup?: TelegramReplyMarkup;
}

export interface TelegramAnswerCallbackInput {
  callbackQueryId: string;
  text?: string;
}

export interface TelegramPublicBotClient {
  sendMessage(input: TelegramSendMessageInput): Promise<void>;
  editMessage(input: TelegramEditMessageInput): Promise<void>;
  answerCallbackQuery(input: TelegramAnswerCallbackInput): Promise<void>;
}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly description?: string,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

function isMessageNotModified(error: unknown): boolean {
  return (
    error instanceof TelegramApiError &&
    error.status === 400 &&
    error.description?.toLowerCase().includes("message is not modified") === true
  );
}

export function createTelegramPublicBotClient(
  botToken: string,
  fetchImpl: typeof fetch = fetch,
): TelegramPublicBotClient {
  async function call(method: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { description?: unknown }
        | null;
      const description =
        typeof payload?.description === "string" ? payload.description : undefined;
      throw new TelegramApiError(
        `Telegram ${method} failed with ${response.status}${description ? `: ${description}` : ""}`,
        response.status,
        description,
      );
    }
  }

  return {
    async sendMessage(input) {
      await call("sendMessage", {
        chat_id: input.chatId,
        text: input.text,
        ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
      });
    },
    async editMessage(input) {
      try {
        await call("editMessageText", {
          chat_id: input.chatId,
          message_id: input.messageId,
          text: input.text,
          ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
        });
      } catch (error) {
        // Telegram returns HTTP 400 when an inline callback renders exactly the
        // same text and markup. That is a successful no-op for our router: it
        // must continue so answerCallbackQuery can acknowledge the user's tap.
        if (isMessageNotModified(error)) return;
        throw error;
      }
    },
    async answerCallbackQuery(input) {
      await call("answerCallbackQuery", {
        callback_query_id: input.callbackQueryId,
        ...(input.text ? { text: input.text } : {}),
      });
    },
  };
}
