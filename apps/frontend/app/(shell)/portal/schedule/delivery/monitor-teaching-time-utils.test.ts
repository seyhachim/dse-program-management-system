import { describe, expect, test } from "bun:test";
import {
  phnomPenhTimeFromIso,
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
