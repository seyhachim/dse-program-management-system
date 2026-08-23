import { describe, expect, test } from "bun:test";
import type { TelegramSessionUser } from "./session.ts";
import {
  analyticsProgrammeContexts,
  classifyTelegramMiniAppUsage,
} from "./usage-analytics.ts";

function request(method: string, path: string) {
  return { method, originalUrl: `/api/telegram/mini${path}`, path };
}

describe("Telegram Mini App usage analytics", () => {
  test("classifies only meaningful successful-view routes", () => {
    expect(classifyTelegramMiniAppUsage(request("GET", "/home") as never)).toEqual({
      eventType: "HomeViewed",
    });
    expect(classifyTelegramMiniAppUsage(request("GET", "/classes/offering-1") as never)).toEqual({
      eventType: "ClassViewed",
      offeringId: "offering-1",
    });
    expect(
      classifyTelegramMiniAppUsage(request("GET", "/student-attendance/offering-2") as never),
    ).toEqual({ eventType: "AttendanceHistoryViewed", offeringId: "offering-2" });
    expect(
      classifyTelegramMiniAppUsage(request("GET", "/attendance/offering-3/2026-08-23") as never),
    ).toEqual({ eventType: "AttendanceRosterViewed", offeringId: "offering-3" });
  });

  test("does not turn mutations or configuration reads into product analytics", () => {
    expect(classifyTelegramMiniAppUsage(request("PUT", "/attendance/offering-1/2026-08-23") as never)).toBeNull();
    expect(classifyTelegramMiniAppUsage(request("GET", "/notification-preferences") as never)).toBeNull();
  });

  test("creates one programme-scoped context and chooses the meaningful staff role", () => {
    const user = {
      roles: ["lecturer", "qa_contributor"],
      programmeRoles: [
        { role: "lecturer", programmeId: "dse" },
        { role: "qa_contributor", programmeId: "dse" },
      ],
    } satisfies Pick<TelegramSessionUser, "roles" | "programmeRoles">;

    expect(analyticsProgrammeContexts(user)).toEqual([
      { programmeId: "dse", actorRole: "lecturer" },
    ]);
  });

  test("skips global-only roles instead of guessing a programme", () => {
    const user = {
      roles: ["admin"],
      programmeRoles: [{ role: "admin", programmeId: null }],
    } satisfies Pick<TelegramSessionUser, "roles" | "programmeRoles">;

    expect(analyticsProgrammeContexts(user)).toEqual([]);
  });
});
