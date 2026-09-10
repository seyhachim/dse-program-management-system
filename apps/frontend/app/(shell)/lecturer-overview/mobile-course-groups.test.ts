import { describe, expect, test } from "bun:test";
import type { OfferingMeetingView, OfferingView } from "@dse-pms/shared-types";
import {
  compactAcademicPeriodLabel,
  compactScheduleLabel,
  groupLecturerOfferings,
} from "./mobile-course-groups";

function meeting(
  overrides: Partial<OfferingMeetingView> = {},
): OfferingMeetingView {
  return {
    id: "meeting-1",
    dayOfWeek: "Thursday",
    startTime: "07:00",
    endTime: "08:30",
    room: "305",
    activityType: "Lecture",
    durationHours: 1.5,
    ...overrides,
  };
}

function offering(overrides: Partial<OfferingView> = {}): OfferingView {
  return {
    id: "offering-m1",
    term: "2026-2027-S1",
    sectionCode: "M1",
    status: "Planned",
    capacity: 45,
    enrolledCount: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    semester: "First",
    programmeYear: 3,
    academicCalendarPeriodId: "period-s1",
    academicCalendar: {
      periodId: "period-s1",
      calendarId: "calendar-2026",
      academicYearId: "academic-year-2026",
      academicYearLabel: "2026-2027",
      revision: 1,
      studyYears: [3],
      semester: "First",
      teachingStart: "2026-09-14",
      teachingEnd: "2027-01-16",
    },
    startDate: "2026-09-14",
    endDate: "2027-01-16",
    otherLecturers: null,
    meetings: [meeting()],
    course: {
      id: "course-dss301",
      code: "DSS301",
      title: "Data Science for Smart Agriculture",
      programmeId: "programme-dse",
    },
    courseSpec: null,
    lecturer: {
      id: "lecturer-primary",
      name: "Primary Lecturer",
      email: "primary@example.test",
      title: null,
      qualification: null,
      phone: null,
    },
    coLecturers: [],
    students: [],
    ...overrides,
  };
}

describe("lecturer mobile course grouping", () => {
  test("groups sections of the same course and academic period", () => {
    const groups = groupLecturerOfferings(
      [
        offering({ id: "offering-m2", sectionCode: "M2" }),
        offering({ id: "offering-m1", sectionCode: "M1" }),
      ],
      "lecturer-primary",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].offerings.map((item) => item.sectionCode)).toEqual([
      "M1",
      "M2",
    ]);
    expect(groups[0].commonRole).toBe("Primary Lecturer");
    expect(groups[0].commonStatus).toBe("Planned");
    expect(groups[0].commonTeachingPeriod).toEqual({
      startDate: "2026-09-14",
      endDate: "2027-01-16",
    });
  });

  test("never combines the same course across academic periods", () => {
    const groups = groupLecturerOfferings(
      [
        offering(),
        offering({
          id: "offering-s2",
          sectionCode: "M1",
          term: "2026-2027-S2",
          semester: "Second",
          academicCalendarPeriodId: "period-s2",
          academicCalendar: {
            periodId: "period-s2",
            calendarId: "calendar-2026",
            academicYearId: "academic-year-2026",
            academicYearLabel: "2026-2027",
            revision: 1,
            studyYears: [3],
            semester: "Second",
            teachingStart: "2027-02-01",
            teachingEnd: "2027-06-01",
          },
          startDate: "2027-02-01",
          endDate: "2027-06-01",
        }),
      ],
      "lecturer-primary",
    );

    expect(groups).toHaveLength(2);
  });

  test("keeps role, status, and teaching-date differences visible", () => {
    const groups = groupLecturerOfferings(
      [
        offering(),
        offering({
          id: "offering-m2",
          sectionCode: "M2",
          status: "Active",
          lecturer: {
            id: "another-primary",
            name: "Another Lecturer",
            email: "another@example.test",
            title: null,
            qualification: null,
            phone: null,
          },
          startDate: "2026-09-21",
        }),
      ],
      "lecturer-primary",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].commonRole).toBeNull();
    expect(groups[0].commonStatus).toBeNull();
    expect(groups[0].commonTeachingPeriod).toBeNull();
  });

  test("uses a compact academic-period label", () => {
    expect(compactAcademicPeriodLabel(offering())).toBe("2026-2027 · Y3 · S1");
  });
});

describe("compact lecturer schedule", () => {
  test("merges consecutive same-day meetings in the same room", () => {
    expect(
      compactScheduleLabel([
        meeting({ id: "second", startTime: "08:30", endTime: "10:00" }),
        meeting({ id: "first", startTime: "07:00", endTime: "08:30" }),
      ]),
    ).toBe("Thu 07:00–10:00");
  });

  test("does not hide gaps, room changes, or different days", () => {
    expect(
      compactScheduleLabel([
        meeting({ id: "first", startTime: "07:00", endTime: "08:30" }),
        meeting({
          id: "room-change",
          startTime: "08:30",
          endTime: "10:00",
          room: "306",
        }),
        meeting({
          id: "gap",
          startTime: "11:00",
          endTime: "12:30",
        }),
        meeting({
          id: "friday",
          dayOfWeek: "Friday",
          startTime: "07:00",
          endTime: "08:30",
        }),
      ]),
    ).toBe(
      "Thu 07:00–08:30 · Thu 08:30–10:00 · Thu 11:00–12:30 · Fri 07:00–08:30",
    );
  });
});
