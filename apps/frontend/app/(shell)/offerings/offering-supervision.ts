import type { OfferingView } from "@dse-pms/shared-types";
import type { OfferingGroup } from "@/lib/offering-groups";

export type OfferingLecturer = NonNullable<OfferingView["lecturer"]>;

export function isSupervisionOfferingGroup(group: OfferingGroup): boolean {
  const code = group.course?.code?.trim().toUpperCase() ?? "";
  const title = group.course?.title?.trim().toLowerCase() ?? "";

  return code.startsWith("FPR") || title.startsWith("final project");
}

export function offeringTeachingTeam(offering: OfferingView): OfferingLecturer[] {
  const team = new Map<string, OfferingLecturer>();

  if (offering.lecturer) {
    team.set(offering.lecturer.id, offering.lecturer);
  }

  for (const lecturer of offering.coLecturers) {
    team.set(lecturer.id, lecturer);
  }

  return Array.from(team.values());
}

export function groupTeachingTeam(group: OfferingGroup): OfferingLecturer[] {
  const team = new Map<string, OfferingLecturer>();

  for (const offering of group.offerings) {
    for (const lecturer of offeringTeachingTeam(offering)) {
      team.set(lecturer.id, lecturer);
    }
  }

  return Array.from(team.values());
}
