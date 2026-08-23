import type { OfferingView } from "@dse-pms/shared-types";

export type LecturerTeachingRole = "Primary Lecturer" | "Co-Lecturer";

export interface LecturerTeachingRow {
  offering: OfferingView;
  role: LecturerTeachingRole;
}

/**
 * Build portfolio teaching rows only from canonical Offering assignments.
 * The portfolio never accepts manual course claims as current teaching evidence.
 */
export function buildLecturerTeachingRows(
  offerings: OfferingView[],
  lecturerId: string,
): LecturerTeachingRow[] {
  return offerings
    .flatMap((offering): LecturerTeachingRow[] => {
      if (offering.lecturer?.id === lecturerId) {
        return [{ offering, role: "Primary Lecturer" }];
      }
      if (offering.coLecturers.some((lecturer) => lecturer.id === lecturerId)) {
        return [{ offering, role: "Co-Lecturer" }];
      }
      return [];
    })
    .sort((left, right) => {
      const term = right.offering.term.localeCompare(left.offering.term);
      if (term !== 0) return term;
      return (left.offering.course?.code ?? "").localeCompare(right.offering.course?.code ?? "");
    });
}

export function currentLecturerTeachingRows(rows: LecturerTeachingRow[]): LecturerTeachingRow[] {
  return rows.filter(({ offering }) => offering.status === "Active" || offering.status === "Planned");
}

export function uniqueTeachingCourseCount(rows: LecturerTeachingRow[]): number {
  return new Set(rows.map(({ offering }) => offering.course?.id).filter(Boolean)).size;
}
