import { describe, expect, test } from "bun:test";
import type { OfferingGroup } from "./offering-groups";
import {
  filterOfferingGroups,
  offeringScheduleEntries,
} from "./offering-list-view";

function group(overrides: {
  id: string;
  code: string;
  title?: string;
  programmeYear: number | null;
  sectionCode?: string;
  lecturerName?: string;
}): OfferingGroup {
  return {
    id: overrides.id,
    term: "2026-2027-S1",
    course: {
      id: `course-${overrides.code}`,
      code: overrides.code,
      title: overrides.title ?? overrides.code,
      programmeId: "programme-1",
    },
    offerings: [
      {
        id: `offering-${overrides.id}`,
        sectionCode: overrides.sectionCode ?? "M1",
        programmeYear: overrides.programmeYear,
        lecturer: overrides.lecturerName
          ? { id: "lecturer-1", name: overrides.lecturerName }
          : null,
        coLecturers: [],
        meetings: [],
      },
    ],
  } as unknown as OfferingGroup;
}

describe("Course Offerings list view", () => {
  test("filters by study year while keeping legacy rows under All years", () => {
    const groups = [
      group({ id: "year-2", code: "DS201", programmeYear: 2 }),
      group({ id: "year-3", code: "TSA301", programmeYear: 3 }),
      group({ id: "legacy", code: "CS101", programmeYear: null }),
    ];

    expect(filterOfferingGroups(groups, "", "3").map((item) => item.id)).toEqual([
      "year-3",
    ]);
    expect(filterOfferingGroups(groups, "", "all").map((item) => item.id)).toEqual([
      "year-2",
      "year-3",
      "legacy",
    ]);
  });

  test("composes the year filter with the existing text search", () => {
    const groups = [
      group({
        id: "tsa",
        code: "TSA301",
        title: "Time Series Analysis",
        programmeYear: 3,
        lecturerName: "Chim Seyha",
      }),
      group({
        id: "dmi",
        code: "DMI301",
        title: "Data Mining",
        programmeYear: 3,
        lecturerName: "Heng Chanarin",
      }),
      group({ id: "other-year", code: "TSA201", programmeYear: 2 }),
    ];

    expect(filterOfferingGroups(groups, "seyha", "3").map((item) => item.id)).toEqual([
      "tsa",
    ]);
    expect(filterOfferingGroups(groups, "TSA", "2").map((item) => item.id)).toEqual([
      "other-year",
    ]);
  });

  test("keeps class identity and every meeting block in grouped schedules", () => {
    const scheduleGroup = {
      id: "dss301",
      term: "2026-2027-S1",
      course: null,
      offerings: [
        {
          id: "m2",
          sectionCode: "M2",
          meetings: [
            {
              id: "m2-late",
              dayOfWeek: "Thursday",
              startTime: "08:30",
              endTime: "10:00",
              room: "305",
            },
            {
              id: "m2-early",
              dayOfWeek: "Thursday",
              startTime: "07:00",
              endTime: "08:30",
              room: "305",
            },
          ],
        },
        {
          id: "m1",
          sectionCode: "M1",
          meetings: [
            {
              id: "m1-early",
              dayOfWeek: "Friday",
              startTime: "07:00",
              endTime: "08:30",
              room: "306",
            },
            {
              id: "m1-late",
              dayOfWeek: "Friday",
              startTime: "08:30",
              endTime: "10:00",
              room: "306",
            },
          ],
        },
      ],
    } as unknown as OfferingGroup;

    expect(offeringScheduleEntries(scheduleGroup)).toEqual([
      {
        key: "m1:m1-early",
        sectionCode: "M1",
        dayOfWeek: "Friday",
        startTime: "07:00",
        endTime: "08:30",
        room: "306",
      },
      {
        key: "m1:m1-late",
        sectionCode: "M1",
        dayOfWeek: "Friday",
        startTime: "08:30",
        endTime: "10:00",
        room: "306",
      },
      {
        key: "m2:m2-early",
        sectionCode: "M2",
        dayOfWeek: "Thursday",
        startTime: "07:00",
        endTime: "08:30",
        room: "305",
      },
      {
        key: "m2:m2-late",
        sectionCode: "M2",
        dayOfWeek: "Thursday",
        startTime: "08:30",
        endTime: "10:00",
        room: "305",
      },
    ]);
  });
});
