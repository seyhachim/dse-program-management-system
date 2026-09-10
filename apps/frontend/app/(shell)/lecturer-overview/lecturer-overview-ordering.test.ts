import { describe, expect, test } from "bun:test";
import type { OfferingView } from "@dse-pms/shared-types";
import {
  compactScheduleLabel,
  groupOfferingsForMobile,
  nextTeachingOccurrence,
  upcomingTeachingLabel,
  type LecturerOverviewOffering,
} from "./lecturer-overview-ordering";

type Meeting = OfferingView["meetings"][number];

function meeting(
  id: string,
  dayOfWeek: Meeting["dayOfWeek"],
  startTime: string,
  endTime: string,
): Meeting {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return {
    id,
    dayOfWeek,
    startTime,
    endTime,
    building: "STEM Building",
    room: "305",
    activityType: "Lecture",
    durationHours:
      endHour - startHour + (endMinute - startMinute) / 60,
  };
}

function offering(
  overrides: Partial<LecturerOverviewOffering> & Pick<LecturerOverviewOffering, "id" | "sectionCode">,
): LecturerOverviewOffering {
  return {
    id: overrides.id,
    term: "2026-2027-S1",
    sectionCode: overrides.sectionCode,
    status: "Planned",
    capacity: 45,
    enrolledCount: 0,
    semester: "First",
    programmeYear: 3,
    academicCalendarPeriodId: "period-s1",
    startDate: "2026-09-14",
    endDate: "2027-01-16",
    meetings: [meeting(`${overrides.id}-meeting`, "Thursday", "07:00", "08:30")],
    course: {
      id: "course-dss301",
      code: "DSS301",
      title: "Data Science for Smart Agriculture",
      programmeId: "programme-dse",
    },
    ...overrides,
  };
}

describe("lecturer mobile overview ordering", () => {
  test("groups same-course sections in one academic period and sorts the next section first", () => {
    const now = new Date(2026, 8, 10, 19, 44);
    const m1 = offering({
      id: "m1",
      sectionCode: "M1",
      meetings: [meeting("m1-fri", "Friday", "07:00", "08:30")],
    });
    const m2 = offering({
      id: "m2",
      sectionCode: "M2",
      meetings: [meeting("m2-thu", "Thursday", "07:00", "08:30")],
    });

    const groups = groupOfferingsForMobile([m1, m2], now);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.sections.map((section) => section.offering.sectionCode)).toEqual([
      "M2",
      "M1",
    ]);
    expect(groups[0]?.next?.offering.id).toBe("m2");
    expect(groups[0]?.next?.startsAt.getDate()).toBe(17);
  });

  test("does not merge the same course across different canonical academic periods", () => {
    const now = new Date(2026, 8, 10, 12, 0);
    const semesterOne = offering({ id: "s1", sectionCode: "M1" });
    const semesterTwo = offering({
      id: "s2",
      sectionCode: "M1",
      term: "2026-2027-S2",
      semester: "Second",
      academicCalendarPeriodId: "period-s2",
      startDate: "2027-02-01",
      endDate: "2027-06-01",
    });

    const groups = groupOfferingsForMobile([semesterTwo, semesterOne], now);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.term)).toEqual([
      "2026-2027-S1",
      "2026-2027-S2",
    ]);
  });

  test("respects teaching windows and never treats a completed offering as upcoming", () => {
    const now = new Date(2026, 8, 10, 12, 0);
    const past = offering({
      id: "past",
      sectionCode: "P1",
      startDate: "2026-01-01",
      endDate: "2026-06-01",
    });
    const explicitlyCompleted = offering({
      id: "complete",
      sectionCode: "C1",
      status: "Completed",
    });
    const future = offering({
      id: "future",
      sectionCode: "F1",
      startDate: "2026-11-02",
      endDate: "2026-12-20",
      meetings: [meeting("future-mon", "Monday", "09:00", "10:30")],
    });

    expect(nextTeachingOccurrence(past, now)).toBeNull();
    expect(nextTeachingOccurrence(explicitlyCompleted, now)).toBeNull();
    expect(nextTeachingOccurrence(future, now)?.startsAt).toEqual(
      new Date(2026, 10, 2, 9, 0),
    );
  });

  test("keeps an in-progress meeting first and labels it as now", () => {
    const now = new Date(2026, 8, 17, 7, 45);
    const current = offering({
      id: "current",
      sectionCode: "M2",
      meetings: [meeting("current-thu", "Thursday", "07:00", "08:30")],
    });

    const next = nextTeachingOccurrence(current, now);

    expect(next?.startsAt).toEqual(new Date(2026, 8, 17, 7, 0));
    expect(next && upcomingTeachingLabel(next, now)).toBe("Now · 07:00–08:30");
  });

  test("compacts repeated weekdays without losing individual meeting times", () => {
    const course = offering({
      id: "compact",
      sectionCode: "M2",
      meetings: [
        meeting("slot-2", "Thursday", "08:30", "10:00"),
        meeting("slot-1", "Thursday", "07:00", "08:30"),
      ],
    });

    expect(compactScheduleLabel(course)).toBe(
      "Thu 07:00–08:30, 08:30–10:00",
    );
  });
});
