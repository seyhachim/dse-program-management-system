import { describe, expect, test } from "bun:test";
import { lecturerArrivalPunctuality } from "./monitor-arrival-utils";

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
