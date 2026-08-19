import { describe, expect, test } from "bun:test";
import { statusToneClass } from "../src/components/status-badge.tsx";

describe("statusToneClass", () => {
  test("maps semantic workflow tones to semantic theme utilities", () => {
    expect(statusToneClass("success")).toBe("bg-success-bg text-success");
    expect(statusToneClass("warning")).toBe("bg-warning-bg text-warning");
    expect(statusToneClass("info")).toBe("bg-info-bg text-info");
    expect(statusToneClass("danger")).toBe("bg-error-bg text-error");
    expect(statusToneClass("neutral")).toBe("bg-inactive-bg text-inactive");
  });

  test("keeps legacy tone utilities source-compatible", () => {
    expect(statusToneClass("live")).toBe("bg-status-live-bg text-status-live");
    expect(statusToneClass("upcoming")).toBe("bg-status-upcoming-bg text-status-upcoming");
    expect(statusToneClass("tournament")).toBe("bg-status-tournament-bg text-status-tournament");
  });
});
