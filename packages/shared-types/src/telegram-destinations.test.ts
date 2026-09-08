import { describe, expect, test } from "bun:test";
import {
  TelegramDestinationCreateRequestSchema,
  TelegramDestinationSchema,
} from "./telegram-destinations.ts";

describe("Telegram destination contracts", () => {
  test("requires a canonical PMS cohort scope for cohort destinations", () => {
    expect(TelegramDestinationCreateRequestSchema.safeParse({
      name: "Generation 6",
      audienceType: "COHORT",
      chatType: "SUPERGROUP",
    }).success).toBe(false);

    expect(TelegramDestinationCreateRequestSchema.safeParse({
      name: "Generation 6",
      audienceType: "COHORT",
      scopeId: "cohort-6",
      chatType: "SUPERGROUP",
    }).success).toBe(true);
  });

  test("does not expose unsupported class-section creation until PMS has a canonical section record", () => {
    expect(TelegramDestinationCreateRequestSchema.safeParse({
      name: "Year 3 M1",
      audienceType: "CLASS_SECTION",
      scopeId: "free-form-class",
      chatType: "SUPERGROUP",
    }).success).toBe(false);
  });

  test("rejects confidential or routing-only fields from destination DTOs", () => {
    const base = {
      id: "destination-1",
      programmeId: "dse",
      name: "DSE Lecturers",
      chatType: "SUPERGROUP",
      botKind: "PMS",
      audienceType: "ALL_LECTURERS",
      status: "CONNECTED",
      enabled: true,
      connected: true,
      createdAt: "2026-09-08T10:00:00.000Z",
      updatedAt: "2026-09-08T10:00:00.000Z",
    };

    expect(TelegramDestinationSchema.safeParse(base).success).toBe(true);
    expect(TelegramDestinationSchema.safeParse({
      ...base,
      chatId: "-100123456789",
      confidentialReason: "must never leave PMS",
    }).success).toBe(false);
  });
});
