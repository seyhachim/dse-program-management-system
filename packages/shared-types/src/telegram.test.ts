import { describe, expect, test } from "bun:test";
import {
  TelegramHealthResponseSchema,
  TelegramHomeResponseSchema,
  TelegramInitDataVerifyRequestSchema,
  TelegramInitDataVerifyResponseSchema,
  TelegramPublicConfigSchema,
  telegramManifest,
} from "./telegram.ts";

describe("Telegram public contracts", () => {
  test("accepts public configuration", () => {
    expect(
      TelegramPublicConfigSchema.parse({
        enabled: true,
        botUsername: "DSEPMSBot",
        miniAppUrl: "https://example.com/telegram",
        miniAppShortName: "pms",
      }),
    ).toEqual({
      enabled: true,
      botUsername: "DSEPMSBot",
      miniAppUrl: "https://example.com/telegram",
      miniAppShortName: "pms",
    });
  });

  test("rejects malformed public configuration", () => {
    expect(() =>
      TelegramPublicConfigSchema.parse({ enabled: true, miniAppUrl: "not-a-url" }),
    ).toThrow();
  });

  test("keeps the API mount id stable", () => {
    expect(telegramManifest.id).toBe("telegram");
  });

  test("validates health responses", () => {
    expect(
      TelegramHealthResponseSchema.parse({ ok: true, enabled: false, configured: true }),
    ).toEqual({ ok: true, enabled: false, configured: true });
  });

  test("validates init data verification request and response contracts", () => {
    expect(
      TelegramInitDataVerifyRequestSchema.parse({ initData: "auth_date=1&hash=abc" }),
    ).toEqual({ initData: "auth_date=1&hash=abc" });

    expect(
      TelegramInitDataVerifyResponseSchema.parse({
        verified: true,
        verificationId: "550e8400-e29b-41d4-a716-446655440000",
        telegramUser: { id: "123456789" },
        authDate: "2026-08-16T05:00:00.000Z",
        expiresAt: "2026-08-16T05:05:00.000Z",
      }).telegramUser.id,
    ).toBe("123456789");
  });

  test("validates the student today home projection", () => {
    const parsed = TelegramHomeResponseSchema.parse({
      user: {
        id: "user-1",
        name: "Student One",
        email: "student@example.edu",
        roles: ["student"],
      },
      courses: [],
      today: {
        date: "2026-08-23",
        dayOfWeek: "Sunday",
        localTime: "09:04",
        classes: [
          {
            meetingId: "meeting-1",
            offeringId: "offering-1",
            courseCode: "PAN202",
            courseTitle: "Predictive Analytics",
            sectionCode: "A",
            date: "2026-08-23",
            dayOfWeek: "Sunday",
            startTime: "09:00",
            endTime: "11:00",
            room: "Room 301",
            activityType: "Lecture",
            lecturerNames: ["Chim Seyha"],
            arrivalStatus: "Present",
            arrivalRecordedAt: "2026-08-23T02:04:00.000Z",
            sessionStatus: "Scheduled",
            canConfirmLecturerArrival: false,
          },
        ],
        nextClass: null,
      },
      unreadAnnouncements: 1,
      publishedResultCount: 2,
      surveyActions: 1,
    });

    expect(parsed.today?.classes[0]?.courseCode).toBe("PAN202");
    expect(parsed.today?.classes[0]?.arrivalStatus).toBe("Present");
    expect(parsed.today?.classes[0]?.canConfirmLecturerArrival).toBe(false);
  });
});
