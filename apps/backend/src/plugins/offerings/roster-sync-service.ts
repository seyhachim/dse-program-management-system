import type {
  CanonicalRosterSyncApplyInput,
  CanonicalRosterSyncApplyResult,
  CanonicalRosterSyncInput,
  CanonicalRosterSyncPreview,
  CanonicalSectionRosterRef,
  OfferingRosterSyncItem,
  StudentsSectionRosterContract,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

export class RosterSyncReferenceError extends Error {}
export class RosterSyncBlockedError extends Error {
  constructor(public readonly preview: CanonicalRosterSyncPreview) {
    super("Roster synchronization is blocked; review capacity or unexpected extra enrollments");
  }
}

type OfferingRosterRow = {
  id: string;
  term: string;
  programmeYear: number | null;
  sectionCode: string;
  capacity: number;
  status: "Planned" | "Active" | "Completed";
  course: { id: string; code: string; title: string };
  enrollments: Array<{ studentId: string }>;
};

const sectionRosters = () =>
  registry.get<StudentsSectionRosterContract>("students").service;

function studentMap(roster: CanonicalSectionRosterRef) {
  return new Map(roster.students.map((student) => [student.id, student]));
}

export function buildRosterSyncPreview(
  roster: CanonicalSectionRosterRef,
  input: CanonicalRosterSyncInput,
  rows: OfferingRosterRow[],
): CanonicalRosterSyncPreview {
  const canonical = studentMap(roster);
  const offerings: OfferingRosterSyncItem[] = rows.map((row) => {
    const currentIds = new Set(row.enrollments.map((item) => item.studentId));
    const missingStudents = roster.students.filter((student) => !currentIds.has(student.id));
    const unexpectedExtraStudents = row.enrollments
      .filter((item) => !canonical.has(item.studentId))
      .map((item) => ({ id: item.studentId, name: "Existing offering student", studentId: null }));

    if (row.status === "Completed") {
      return {
        offeringId: row.id,
        course: row.course,
        status: row.status,
        term: row.term,
        programmeYear: row.programmeYear,
        sectionCode: row.sectionCode,
        capacity: row.capacity,
        currentCount: row.enrollments.length,
        canonicalCount: roster.students.length,
        missingStudents,
        unexpectedExtraStudents,
        state: "historical",
        blockedReason: null,
      };
    }

    const projectedCount = row.enrollments.length + missingStudents.length;
    const blockedReason = unexpectedExtraStudents.length > 0
      ? `${unexpectedExtraStudents.length} unexpected enrollment(s) require manual review before sync`
      : projectedCount > row.capacity
        ? `Canonical roster would exceed capacity (${projectedCount}/${row.capacity})`
        : null;

    return {
      offeringId: row.id,
      course: row.course,
      status: row.status,
      term: row.term,
      programmeYear: row.programmeYear,
      sectionCode: row.sectionCode,
      capacity: row.capacity,
      currentCount: row.enrollments.length,
      canonicalCount: roster.students.length,
      missingStudents,
      unexpectedExtraStudents,
      state: blockedReason ? "blocked" : missingStudents.length > 0 ? "needs_sync" : "synced",
      blockedReason,
    };
  });

  const mutable = offerings.filter((item) => item.status !== "Completed");
  return {
    sourceSection: {
      sectionId: roster.sectionId,
      cohortId: roster.cohortId,
      programmeId: roster.programmeId,
      code: roster.code,
      name: roster.name,
      active: roster.active,
      studentCount: roster.students.length,
    },
    term: input.term,
    programmeYear: input.programmeYear,
    offerings,
    canApply: roster.active && mutable.some((item) => item.state !== "blocked"),
    missingEnrollmentCount: mutable.reduce((sum, item) => sum + item.missingStudents.length, 0),
    blockedOfferingCount: mutable.filter((item) => item.state === "blocked").length,
    historicalOfferingCount: offerings.filter((item) => item.state === "historical").length,
  };
}

async function resolveRoster(input: CanonicalRosterSyncInput) {
  const roster = await sectionRosters().getSectionRoster(input.sectionId);
  if (!roster) throw new RosterSyncReferenceError("Cohort section not found");
  if (!roster.active) throw new RosterSyncReferenceError("Disabled cohort sections cannot be synchronized");
  return roster;
}

function targetWhere(roster: CanonicalSectionRosterRef, input: CanonicalRosterSyncInput) {
  return {
    term: input.term,
    programmeYear: input.programmeYear,
    sectionCode: roster.code,
    course: { programmeId: roster.programmeId },
  } as const;
}

const targetSelect = {
  id: true,
  term: true,
  programmeYear: true,
  sectionCode: true,
  capacity: true,
  status: true,
  course: { select: { id: true, code: true, title: true } },
  enrollments: { select: { studentId: true } },
} as const;

export const rosterSyncService = {
  async preview(input: CanonicalRosterSyncInput): Promise<CanonicalRosterSyncPreview> {
    const roster = await resolveRoster(input);
    const rows = await prisma.offering.findMany({
      where: targetWhere(roster, input),
      select: targetSelect,
      orderBy: { course: { code: "asc" } },
    });
    return buildRosterSyncPreview(roster, input, rows);
  },

  async apply(input: CanonicalRosterSyncApplyInput): Promise<CanonicalRosterSyncApplyResult> {
    const roster = await resolveRoster(input);
    const selected = new Set(input.offeringIds);
    let createdEnrollmentCount = 0;

    await prisma.$transaction(async (tx) => {
      const rows = await tx.offering.findMany({
        where: targetWhere(roster, input),
        select: targetSelect,
        orderBy: { course: { code: "asc" } },
      });
      const preview = buildRosterSyncPreview(roster, input, rows);
      const selectedItems = preview.offerings.filter((item) => selected.has(item.offeringId));
      if (selectedItems.length !== selected.size) {
        throw new RosterSyncReferenceError("One or more selected offerings do not match this canonical class context");
      }
      if (selectedItems.some((item) => item.status === "Completed")) {
        throw new RosterSyncBlockedError(preview);
      }
      if (selectedItems.some((item) => item.state === "blocked")) {
        throw new RosterSyncBlockedError(preview);
      }

      for (const item of selectedItems) {
        if (item.missingStudents.length === 0) continue;
        const result = await tx.enrollment.createMany({
          data: item.missingStudents.map((student) => ({
            offeringId: item.offeringId,
            studentId: student.id,
          })),
          skipDuplicates: true,
        });
        createdEnrollmentCount += result.count;
      }
    });

    const refreshed = await this.preview(input);
    return { ...refreshed, selectedOfferingIds: [...selected], createdEnrollmentCount };
  },
};
