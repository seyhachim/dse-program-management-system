import type { OfferingGroup } from "./offering-groups";

export type OfferingYearFilter = "all" | "1" | "2" | "3" | "4";

export const OFFERING_YEAR_FILTER_OPTIONS: Array<{
  value: OfferingYearFilter;
  label: string;
}> = [
  { value: "all", label: "All years" },
  { value: "1", label: "Year 1" },
  { value: "2", label: "Year 2" },
  { value: "3", label: "Year 3" },
  { value: "4", label: "Year 4" },
];

export type OfferingScheduleEntry = {
  key: string;
  sectionCode: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string | null;
};

const DAY_ORDER = new Map(
  [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ].map((day, index) => [day, index]),
);

/**
 * Keep Course Offerings list filtering entirely presentational. The API remains
 * the source of the caller's authorized rows; this helper only narrows what is
 * shown in the already-authorized result set.
 */
export function filterOfferingGroups(
  groups: OfferingGroup[],
  search: string,
  yearFilter: OfferingYearFilter,
): OfferingGroup[] {
  const query = search.trim().toLocaleLowerCase();
  const selectedYear = yearFilter === "all" ? null : Number(yearFilter);

  return groups.filter((group) => {
    if (
      selectedYear !== null &&
      !group.offerings.some((offering) => offering.programmeYear === selectedYear)
    ) {
      return false;
    }

    if (!query) return true;

    return [
      group.course?.code,
      group.course?.title,
      group.term,
      ...group.offerings.flatMap((offering) => [
        offering.sectionCode,
        offering.lecturer?.name,
        ...offering.coLecturers.map((lecturer) => lecturer.name),
      ]),
    ].some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

/**
 * Flatten every real weekly meeting in a grouped course row. Class identity is
 * retained so M1/M2 schedules stay understandable without expanding the row.
 */
export function offeringScheduleEntries(
  group: OfferingGroup,
): OfferingScheduleEntry[] {
  return group.offerings
    .flatMap((offering) =>
      offering.meetings.map((meeting) => ({
        key: `${offering.id}:${meeting.id}`,
        sectionCode: offering.sectionCode,
        dayOfWeek: meeting.dayOfWeek,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        room: meeting.room,
      })),
    )
    .sort((a, b) => {
      const sectionCompare = a.sectionCode.localeCompare(b.sectionCode, undefined, {
        numeric: true,
      });
      if (sectionCompare !== 0) return sectionCompare;

      const dayCompare =
        (DAY_ORDER.get(a.dayOfWeek) ?? Number.MAX_SAFE_INTEGER) -
        (DAY_ORDER.get(b.dayOfWeek) ?? Number.MAX_SAFE_INTEGER);
      if (dayCompare !== 0) return dayCompare;

      return a.startTime.localeCompare(b.startTime);
    });
}
