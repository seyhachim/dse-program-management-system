import { afterEach, describe, expect, test } from "bun:test";
import {
  attendanceWarningEventKey,
  sendTelegramPmsMessage,
  teachingLeaveRequesterPath,
  teachingLeaveStudentPath,
} from "./notification-service.ts";

const original = {
  TELEGRAM_PMS_ENABLED: process.env.TELEGRAM_PMS_ENABLED,
  TELEGRAM_PMS_BOT_TOKEN: process.env.TELEGRAM_PMS_BOT_TOKEN,
  TELEGRAM_PMS_BOT_USERNAME: process.env.TELEGRAM_PMS_BOT_USERNAME,
  TELEGRAM_PMS_WEBHOOK_SECRET: process.env.TELEGRAM_PMS_WEBHOOK_SECRET,
  TELEGRAM_PUBLIC_ENABLED: process.env.TELEGRAM_PUBLIC_ENABLED,
  TELEGRAM_PUBLIC_BOT_TOKEN: process.env.TELEGRAM_PUBLIC_BOT_TOKEN,
  TELEGRAM_PUBLIC_BOT_USERNAME: process.env.TELEGRAM_PUBLIC_BOT_USERNAME,
  TELEGRAM_PUBLIC_WEBHOOK_SECRET: process.env.TELEGRAM_PUBLIC_WEBHOOK_SECRET,
  TELEGRAM_MINI_APP_URL: process.env.TELEGRAM_MINI_APP_URL,
  TELEGRAM_MINI_APP_SHORT_NAME: process.env.TELEGRAM_MINI_APP_SHORT_NAME,
};

function configurePmsBot() {
  process.env.TELEGRAM_PMS_ENABLED = "true";
  process.env.TELEGRAM_PMS_BOT_TOKEN = "pms-notification-token";
  process.env.TELEGRAM_PMS_BOT_USERNAME = "DSEPMSBot";
  process.env.TELEGRAM_MINI_APP_URL = "https://example.com/telegram";
  process.env.TELEGRAM_MINI_APP_SHORT_NAME = "pms";
}

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Telegram PMS notifications", () => {
  test("send through the PMS bot token, never the public information bot", async () => {
    configurePmsBot();
    process.env.TELEGRAM_PUBLIC_ENABLED = "true";
    process.env.TELEGRAM_PUBLIC_BOT_TOKEN = "public-information-token";
    process.env.TELEGRAM_PUBLIC_BOT_USERNAME = "DSEInformationBot";
    process.env.TELEGRAM_PUBLIC_WEBHOOK_SECRET = "public-webhook-secret";

    let requestedUrl = "";
    const fakeFetch = (async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 42 } }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    const messageId = await sendTelegramPmsMessage(
      "123",
      "Private PMS message",
      "https://example.com/telegram?startapp=abc",
      fakeFetch,
    );

    expect(messageId).toBe("42");
    expect(requestedUrl).toContain("botpms-notification-token/sendMessage");
    expect(requestedUrl).not.toContain("public-information-token");
  });

  test("uses an ordinary URL button for group and channel chat ids", async () => {
    configurePmsBot();
    let body: any;
    const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await sendTelegramPmsMessage(
      "-1008498104127",
      "DSE PMS test message",
      "https://dse-pms.vercel.app/programme-management/telegram-destinations",
      fakeFetch,
    );

    expect(body.chat_id).toBe("-1008498104127");
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({
      text: "Open DSE PMS",
      url: "https://dse-pms.vercel.app/programme-management/telegram-destinations",
    });
    expect(body.reply_markup.inline_keyboard[0][0].web_app).toBeUndefined();
  });

  test("routes teaching leave requester notifications to the request detail surface", () => {
    expect(teachingLeaveRequesterPath("request/with spaces")).toBe(
      "/telegram/teaching-leave?requestId=request%2Fwith%20spaces",
    );
  });

  test("routes student teaching leave updates to an exact occurrence impact surface", () => {
    expect(teachingLeaveStudentPath("occurrence/with spaces")).toBe(
      "/telegram/schedule-impact?occurrenceId=occurrence%2Fwith%20spaces",
    );
  });
});

describe("attendance warning notification keys", () => {
  test("are deterministic for the same threshold event", () => {
    const input = {
      studentId: "student-1",
      offeringId: "offering-1",
      warningKind: "attendance" as const,
      eventSessionId: "session-3",
    };
    expect(attendanceWarningEventKey(input)).toBe(attendanceWarningEventKey(input));
    expect(attendanceWarningEventKey(input)).toBe(
      "attendance-warning:student-1:offering-1:attendance:3:session-3",
    );
  });

  test("separates attendance and punctuality thresholds", () => {
    const base = { studentId: "student-1", offeringId: "offering-1", eventSessionId: "session-3" };
    expect(attendanceWarningEventKey({ ...base, warningKind: "attendance" })).not.toBe(
      attendanceWarningEventKey({ ...base, warningKind: "punctuality" }),
    );
  });
});
