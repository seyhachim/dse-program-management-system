import type { OfferingView } from "@dse-pms/shared-types";

export type OfferingGroup = {
  id: string;
  course: OfferingView["course"];
  term: string;
  offerings: OfferingView[];
};

/**
 * Build one display row per course and term. Class sections remain separate
 * Offering records inside the group because schedules, rosters and teaching
 * assignments belong to the delivered class, while Course Specification is
 * shared by the parent Course.
 */
export function groupOfferings(rows: OfferingView[]): OfferingGroup[] {
  const groups = new Map<string, OfferingGroup>();

  for (const offering of rows) {
    // Keep a missing-course row isolated so unrelated legacy records never
    // combine under one fallback group.
    const id = offering.course
      ? `${offering.course.id}::${offering.term}`
      : `missing-course::${offering.id}`;
    const group = groups.get(id);
    if (group) {
      group.offerings.push(offering);
    } else {
      groups.set(id, {
        id,
        course: offering.course,
        term: offering.term,
        offerings: [offering],
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    offerings: [...group.offerings].sort((a, b) =>
      a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true }),
    ),
  }));
}
