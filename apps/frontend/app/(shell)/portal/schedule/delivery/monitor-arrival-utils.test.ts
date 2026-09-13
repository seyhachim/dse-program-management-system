import { describe, expect, test } from "bun:test";
import {
  lecturerArrivalPunctuality,
  lecturerArrivalRecordingWindow,
} from "./monitor-arrival-utils";

describe("lecturerArrivalPunctuality", () => {
  test("derives minutes after the Cambodia scheduled start", () => {
    expect(
      lecturerArrivalPunctuality("2026-09-14", "07:00", "2026-09-14T00:08:20.000Z"),
    ).toEqual({
      time: "07:08",
      deltaMinutes: 8,
      label: "8 min after scheduled start",
    });
  });

  test("keeps on-time and early arrival factual rather than disciplinary", () => {
    expect(
      lecturerArrivalPunctuality("2026-09-14", "07:00", "2026-09-14T00:00:00.000Z"),
    ).toEqual({
      time: "07:00",
      deltaMinutes: 0,
      label: "At scheduled start",
    });

    expect(
      lecturerArrivalPunctuality("2026-09-14", "07:00", "2026-09-13T23:55:00.000Z"),
    ).toEqual({
      time: "06:55",
      deltaMinutes: -5,
      label: "5 min before scheduled start",
    });
  });
});

describe("lecturerArrivalRecordingWindow", () => {
  test("blocks a punch before the one-hour pre-class window", () => {
    expect(
      lecturerArrivalRecordingWindow(
        "2026-09-14",
        "07:00",
        "11:00",
        new Date("2026-09-13T22:45:00.000Z"),
      ),
    ).toEqual({
      status: "too-early",
      canRecord: false,
      opensAtTime: "06:00",
      closesAtTime: "11:00",
    });
  });

  test("allows the factual punch from one hour before start through scheduled end", () => {
    expect(
      lecturerArrivalRecordingWindow(
        "2026-09-14",
        "07:00",
        "11:00",
        new Date("2026-09-13T23:00:00.000Z"),
      ).status,
    ).toBe("open");

    expect(
      lecturerArrivalRecordingWindow(
        "2026-09-14",
        "07:00",
        "11:00",
        new Date("2026-09-14T04:00:00.000Z"),
      ).status,
    ).toBe("open");
  });

  test("closes the punch after the scheduled class end", () => {
    expect(
      lecturerArrivalRecordingWindow(
        "2026-09-14",
        "07:00",
        "11:00",
        new Date("2026-09-14T04:01:00.000Z"),
      ),
    ).toEqual({
      status: "closed",
      canRecord: false,
      opensAtTime: "06:00",
      closesAtTime: "11:00",
    });
  });
});
