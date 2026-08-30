import type { TelegramPublicBotClient } from "./telegram-client.ts";

export type PublicTelegramUpdateType = "message" | "callback" | "other";
export type PublicTelegramTimingOutcome = "ok" | "error";

export interface PublicTelegramWebhookTiming {
  updateType: PublicTelegramUpdateType;
  outcome: PublicTelegramTimingOutcome;
  totalMs: number;
  appMs: number;
  pmsDataMs: number;
  telegramApiMs: number;
  telegramSendMs: number;
  telegramEditMs: number;
  telegramAckMs: number;
}

type Clock = () => number;
type TimingLogger = (timing: PublicTelegramWebhookTiming) => void;

type TimingAccumulator = {
  pmsDataMs: number;
  telegramSendMs: number;
  telegramEditMs: number;
  telegramAckMs: number;
};

function elapsed(clock: Clock, startedAt: number): number {
  return Math.max(0, clock() - startedAt);
}

function rounded(milliseconds: number): number {
  return Math.round(milliseconds * 10) / 10;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Records public Telegram webhook timings without carrying Telegram identity,
 * callback payloads, message text, tokens, or academic/public content into logs.
 *
 * `pmsDataMs` is cumulative time spent in top-level PMS public-read/search calls.
 * Some public curriculum calls intentionally run concurrently, so that cumulative
 * value can exceed wall-clock `appMs`; `totalMs` remains the request wall time.
 */
export function createPublicTelegramTimingTracker(
  updateType: PublicTelegramUpdateType,
  clock: Clock = () => performance.now(),
  logger: TimingLogger = (timing) =>
    console.info("Public Telegram webhook timing", timing),
) {
  const startedAt = clock();
  const accumulator: TimingAccumulator = {
    pmsDataMs: 0,
    telegramSendMs: 0,
    telegramEditMs: 0,
    telegramAckMs: 0,
  };

  function wrapPmsService<T extends object>(service: T): T {
    return new Proxy(service, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;

        return (...args: unknown[]) => {
          const callStartedAt = clock();
          try {
            const result = Reflect.apply(value, target, args);
            if (!isPromiseLike(result)) {
              accumulator.pmsDataMs += elapsed(clock, callStartedAt);
              return result;
            }
            return Promise.resolve(result).finally(() => {
              accumulator.pmsDataMs += elapsed(clock, callStartedAt);
            });
          } catch (error) {
            accumulator.pmsDataMs += elapsed(clock, callStartedAt);
            throw error;
          }
        };
      },
    });
  }

  async function timeTelegram(
    bucket: "telegramSendMs" | "telegramEditMs" | "telegramAckMs",
    operation: () => Promise<void>,
  ): Promise<void> {
    const callStartedAt = clock();
    try {
      await operation();
    } finally {
      accumulator[bucket] += elapsed(clock, callStartedAt);
    }
  }

  function wrapTelegramClient(base: TelegramPublicBotClient): TelegramPublicBotClient {
    return {
      sendMessage(input) {
        return timeTelegram("telegramSendMs", () => base.sendMessage(input));
      },
      editMessage(input) {
        return timeTelegram("telegramEditMs", () => base.editMessage(input));
      },
      answerCallbackQuery(input) {
        return timeTelegram("telegramAckMs", () =>
          base.answerCallbackQuery(input),
        );
      },
    };
  }

  function finish(outcome: PublicTelegramTimingOutcome): void {
    const totalMs = elapsed(clock, startedAt);
    const telegramApiMs =
      accumulator.telegramSendMs +
      accumulator.telegramEditMs +
      accumulator.telegramAckMs;
    const timing: PublicTelegramWebhookTiming = {
      updateType,
      outcome,
      totalMs: rounded(totalMs),
      appMs: rounded(Math.max(0, totalMs - telegramApiMs)),
      pmsDataMs: rounded(accumulator.pmsDataMs),
      telegramApiMs: rounded(telegramApiMs),
      telegramSendMs: rounded(accumulator.telegramSendMs),
      telegramEditMs: rounded(accumulator.telegramEditMs),
      telegramAckMs: rounded(accumulator.telegramAckMs),
    };

    try {
      logger(timing);
    } catch {
      // Performance reporting must never break the public bot workflow.
      console.error("Public Telegram webhook timing logger failed");
    }
  }

  return {
    wrapPmsService,
    wrapTelegramClient,
    finish,
  };
}
