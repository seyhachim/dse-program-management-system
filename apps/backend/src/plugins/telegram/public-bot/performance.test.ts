import { describe, expect, test } from "bun:test";
import { createPublicTelegramTimingTracker } from "./performance.ts";
import type { TelegramPublicBotClient } from "./telegram-client.ts";

describe("public Telegram webhook timing", () => {
  test("separates PMS data and Telegram API time without logging identity or content", async () => {
    const clockValues = [0, 1, 6, 7, 11, 12, 15, 20];
    const clock = () => clockValues.shift() ?? 20;
    const logged: unknown[] = [];
    const tracker = createPublicTelegramTimingTracker(
      "message",
      clock,
      (timing) => logged.push(timing),
    );

    const publicRead = tracker.wrapPmsService({
      async listFaqs(_programmeId: string) {
        return [{ question: "sensitive question text" }];
      },
    });
    const baseClient: TelegramPublicBotClient = {
      async sendMessage() {},
      async editMessage() {},
      async answerCallbackQuery() {},
    };
    const client = tracker.wrapTelegramClient(baseClient);

    await publicRead.listFaqs("private-programme-id");
    await client.sendMessage({ chatId: 999999, text: "private response text" });
    tracker.finish("ok");

    expect(logged).toHaveLength(1);
    const timing = logged[0] as Record<string, unknown>;
    expect(Object.keys(timing).sort()).toEqual(
      [
        "appMs",
        "outcome",
        "pmsDataMs",
        "telegramAckMs",
        "telegramApiMs",
        "telegramEditMs",
        "telegramSendMs",
        "totalMs",
        "updateType",
      ].sort(),
    );
    expect(timing.updateType).toBe("message");
    expect(timing.outcome).toBe("ok");
    expect(timing.pmsDataMs).toBeGreaterThanOrEqual(0);
    expect(timing.telegramApiMs).toBeGreaterThanOrEqual(0);

    const serialized = JSON.stringify(timing);
    expect(serialized).not.toContain("999999");
    expect(serialized).not.toContain("private-programme-id");
    expect(serialized).not.toContain("sensitive question text");
    expect(serialized).not.toContain("private response text");
  });

  test("timing logger failure cannot break the Telegram workflow", () => {
    const tracker = createPublicTelegramTimingTracker(
      "callback",
      () => 1,
      () => {
        throw new Error("logger unavailable");
      },
    );

    expect(() => tracker.finish("error")).not.toThrow();
  });
});
