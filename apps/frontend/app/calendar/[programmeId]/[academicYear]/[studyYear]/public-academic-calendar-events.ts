import type { AcademicCalendarEventView } from "@dse-pms/shared-types";

export type PublicAcademicCalendarEventGroups = {
  First: AcademicCalendarEventView[];
  Second: AcademicCalendarEventView[];
  unscoped: AcademicCalendarEventView[];
};

export function groupPublicAcademicCalendarEvents(
  events: AcademicCalendarEventView[],
): PublicAcademicCalendarEventGroups {
  return events.reduce<PublicAcademicCalendarEventGroups>(
    (groups, event) => {
      if (event.semester === "First") {
        groups.First.push(event);
      } else if (event.semester === "Second") {
        groups.Second.push(event);
      } else {
        groups.unscoped.push(event);
      }
      return groups;
    },
    { First: [], Second: [], unscoped: [] },
  );
}
