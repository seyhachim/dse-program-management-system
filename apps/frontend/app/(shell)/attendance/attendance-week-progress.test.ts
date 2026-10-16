import { describe, expect, test } from "bun:test";
import {
  ATTENDANCE_SEMESTER_WEEKS, attendanceWeekOverview, selectableAttendanceWeeks,
  type AttendanceWeekOffering,
} from "./attendance-week-progress";

const thursdayClass: AttendanceWeekOffering = {
  startDate: "2026-09-14",
  endDate: "2027-01-03",
  meetings: [{ dayOfWeek: "Thursday" }],
};

function saved(...dates: string[]) {
  return dates.map((date) => ({ date }));
}

describe("attendance weekly progress", () => {
  test("always draws 16 weeks but only offers Week 1 through the current teaching week", () => {
    const overview = attendanceWeekOverview(thursdayClass, [], "2026-10-15");
    expect(overview.currentWeek).toBe(5);
    expect(overview.weeks).toHaveLength(ATTENDANCE_SEMESTER_WEEKS);
    expect(selectableAttendanceWeeks(overview).map((item) => item.week)).toEqual([1, 2, 3, 4, 5]);
    expect(overview.weeks[5]?.status).toBe("future");
    expect(overview.weeks[5]?.targetDate).toBe("2026-10-22");
  });

  test("green means the actual scheduled date is in the saved session history", () => {
    const overview = attendanceWeekOverview(thursdayClass, saved("2026-09-17", "2026-10-15"), "2026-10-16");
    expect(overview.weeks[0]).toMatchObject({ status: "saved", saved: 1, dates: ["2026-09-17"] });
    expect(overview.weeks[1]).toMatchObject({ status: "missing", saved: 0, dates: ["2026-09-24"] });
    expect(overview.weeks[4]).toMatchObject({ status: "saved", saved: 1, dates: ["2026-10-15"] });
  });

  test("today's unsaved teaching date is current, not incorrectly flagged as a past absence", () => {
    const onTeachingDay = attendanceWeekOverview(thursdayClass, [], "2026-10-15");
    expect(onTeachingDay.weeks[4]).toMatchObject({ status: "current", targetDate: "2026-10-15" });
    const beforeTeachingDay = attendanceWeekOverview(thursdayClass, [], "2026-10-14");
    expect(beforeTeachingDay.weeks[4]?.status).toBe("current");
    const afterTeachingDay = attendanceWeekOverview(thursdayClass, [], "2026-10-16");
    expect(afterTeachingDay.weeks[4]?.status).toBe("missing");
  });

  test("one of two scheduled days saved is still missing evidence, with navigation to the missing day", () => {
    const twice = { ...thursdayClass, meetings: [{ dayOfWeek: "Monday" }, { dayOfWeek: "Thursday" }] } as AttendanceWeekOffering;
    const overview = attendanceWeekOverview(twice, saved("2026-10-12"), "2026-10-16");
    expect(overview.weeks[4]).toMatchObject({
      status: "missing",
      dates: ["2026-10-12", "2026-10-15"],
      saved: 1,
      targetDate: "2026-10-15",
    });
    const complete = attendanceWeekOverview(twice, saved("2026-10-12", "2026-10-15"), "2026-10-16");
    expect(complete.weeks[4]?.status).toBe("saved");
  });

  test("only meeting days inside effective start and end dates are actionable", () => {
    const ended = { ...thursdayClass, endDate: "2026-10-02" };
    const overview = attendanceWeekOverview(ended, [], "2026-10-16");
    expect(overview.currentWeek).toBe(5);
    expect(overview.weeks[2]?.dates).toEqual(["2026-10-01"]);
    expect(overview.weeks[3]).toMatchObject({ dates: [], status: "no-class", targetDate: null });
    expect(selectableAttendanceWeeks(overview).map((item) => item.week)).toEqual([1, 2, 3, 4, 5]);
    expect(selectableAttendanceWeeks(overview)[3]?.targetDate).toBeNull();
  });

  test("before semester starts, the selector is empty and future segments stay neutral", () => {
    const overview = attendanceWeekOverview(thursdayClass, [], "2026-09-01");
    expect(overview.currentWeek).toBe(0);
    expect(selectableAttendanceWeeks(overview)).toEqual([]);
    expect(overview.weeks[0]?.status).toBe("future");
  });

  test("date parsing is strict and malformed/absent periods have no selectable weeks", () => {
    for (const offering of [
      { ...thursdayClass, startDate: null },
      { ...thursdayClass, endDate: null },
      { ...thursdayClass, startDate: "2026-02-30" },
      { ...thursdayClass, endDate: "2026-09-01" },
    ]) {
      expect(attendanceWeekOverview(offering, [], "2026-10-15")).toEqual({ currentWeek: 0, weeks: [] });
    }
    expect(attendanceWeekOverview(thursdayClass, [], "2026-13-01").weeks).toEqual([]);
  });

  test("selection stays bounded to 16 even after an Offering's last week", () => {
    const overview = attendanceWeekOverview(thursdayClass, [], "2027-04-30");
    expect(overview.currentWeek).toBe(16);
    expect(overview.weeks).toHaveLength(16);
    expect(selectableAttendanceWeeks(overview)).toHaveLength(16);
  });

  test("unscheduled ad hoc dates do not claim a normal recurring class was recorded", () => {
    const overview = attendanceWeekOverview(thursdayClass, saved("2026-10-13"), "2026-10-16");
    expect(overview.weeks[4]).toMatchObject({ saved: 0, status: "missing", dates: ["2026-10-15"] });
  });
});
