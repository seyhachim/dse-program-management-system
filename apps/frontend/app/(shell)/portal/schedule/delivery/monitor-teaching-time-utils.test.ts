import { describe, expect, test } from "bun:test";
import {
  phnomPenhTimeFromIso,
  teachingEndRecordingWindow,
  teachingStartRecordingWindow,
  teachingTimingDurationMinutes,
} from "./monitor-teaching-time-utils.ts";

describe("monitor teaching time utilities", () => {
  test("opens teaching start at the shared early-window boundary", () => {
    expect(
      teachingStartRecordingWindow(
        "2026-09-25",
        "07:30",
        "11:30",
        new Date("2026-09-24T23:29:59.000Z"),
      ).status,
    ).toBe("too-early");

    expect(
      teachingStartRecordingWindow(
        "2026-09-25",
        "07:30",
        "11:30",
        new Date("2026-09-24T23:30:00.000Z"),
      ).status,
    ).toBe("open");

    expect(
      teachingStartRecordingWindow(
        "2026-09-25",
        "07:30",
        "11:30",
        new Date("2026-09-25T04:30:01.000Z"),
      ).status,
    ).toBe("closed");
  });

  test("opens teaching end only after one captured minute", () => {
    const startedAt = "2026-09-25T00:40:30.000Z";
    expect(
      teachingEndRecordingWindow(startedAt, new Date("2026-09-25T00:41:29.000Z")),
    ).toEqual({ canRecord: false, secondsRemaining: 1 });
    expect(
      teachingEndRecordingWindow(startedAt, new Date("2026-09-25T00:41:30.000Z")),
    ).toEqual({ canRecord: true, secondsRemaining: 0 });
  });

  test("formats server timestamps in Phnom Penh time and derives delivered minutes", () => {
    expect(phnomPenhTimeFromIso("2026-09-25T04:20:00.000Z")).toBe("11:20");
    expect(
      teachingTimingDurationMinutes(
        "2026-09-25T00:40:00.000Z",
        "2026-09-25T04:20:00.000Z",
      ),
    ).toBe(220);
  });
});
