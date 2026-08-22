import { describe, expect, test } from "bun:test";
import {
  TelegramApiError,
  createTelegramPublicBotClient,
} from "./telegram-client.ts";

function jsonResponse(status: number, description: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error_code: status,
      description,
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("Telegram public bot client", () => {
  test("treats Telegram's unchanged edit response as a successful no-op", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return jsonResponse(
        400,
        "Bad Request: message is not modified: specified new message content and reply markup are exactly the same",
      );
    }) as typeof fetch;
    const client = createTelegramPublicBotClient("123:test-token", fetchImpl);

    await expect(
      client.editMessage({
        chatId: 42,
        messageId: 7,
        text: "Admission",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/editMessageText");
  });

  test("still fails closed for real Telegram edit errors", async () => {
    const fetchImpl = (async () =>
      jsonResponse(400, "Bad Request: message to edit not found")) as typeof fetch;
    const client = createTelegramPublicBotClient("123:test-token", fetchImpl);

    try {
      await client.editMessage({
        chatId: 42,
        messageId: 7,
        text: "Admission",
      });
      throw new Error("Expected editMessage to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(TelegramApiError);
      expect((error as TelegramApiError).status).toBe(400);
      expect((error as TelegramApiError).description).toBe(
        "Bad Request: message to edit not found",
      );
    }
  });
});
