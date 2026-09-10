import { Prisma } from "@prisma/client";
import type {
  LecturerWorkloadSummary,
  MeetingLecturerAssignmentsView,
  MeetingLecturerAssignmentViewItem,
  OfferingView,
  ReplaceMeetingLecturerAssignments,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { offeringService } from "./service.ts";

export class MeetingLecturerAssignmentNotFoundError extends Error {}
export class MeetingLecturerAssignmentValidationError extends Error {}
export class MeetingLecturerAssignmentAuthorizationError extends Error {}

export interface StoredMeetingLecturerAssignment {
  offeringId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  activityType: string;
  lecturerId: string;
}

interface OfferingTeamState {
  id: string;
  lecturerId: string | null;
  coLecturers: { lecturerId: string }[];
}

interface MeetingSignatureLike {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  activityType: string;
}

function signatureKey(offeringId: string, meeting: MeetingSignatureLike): string {
  return [offeringId, meeting.dayOfWeek, meeting.startTime, meeting.endTime, meeting.activityType].join("\u0000");
}

function teamIdsFromOffering(offering: Pick<OfferingView, "lecturer" | "coLecturers">): string[] {
  const ids = [offering.lecturer?.id, ...offering.coLecturers.map((lecturer) => lecturer.id)].filter(
    (id): id is string => Boolean(id),
  );
  return [...new Set(ids)];
}

function teamIdsFromState(state: OfferingTeamState | undefined): string[] {
  if (!state) return [];
  return [...new Set([state.lecturerId, ...state.coLecturers.map((item) => item.lecturerId)].filter((id): id is string => Boolean(id)))];
}

function rowsBySignature(rows: StoredMeetingLecturerAssignment[]): Map<string, StoredMeetingLecturerAssignment[]> {
  const grouped = new Map<string, StoredMeetingLecturerAssignment[]>();
  for (const row of rows) {
    const key = signatureKey(row.offeringId, row);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

function hasCurrentExplicitAssignment(
  offeringId: string,
  meetings: MeetingSignatureLike[],
  groupedRows: Map<string, StoredMeetingLecturerAssignment[]>,
): boolean {
  return meetings.some((meeting) => (groupedRows.get(signatureKey(offeringId, meeting))?.length ?? 0) > 0);
}

/**
 * Resolve effective lecturer ownership for a current meeting.
 *
 * A one-person teaching team is unambiguous and remains backward compatible even
 * without a persisted assignment. Multi-lecturer teams fail closed until the
 * recurring meeting has been explicitly allocated.
 */
export function effectiveMeetingLecturerIds(
  offeringId: string,
  meeting: MeetingSignatureLike,
  teamIds: string[],
  groupedRows: Map<string, StoredMeetingLecturerAssignment[]>,
  offeringHasCurrentExplicitAssignments: boolean,
): { lecturerIds: string[]; source: MeetingLecturerAssignmentViewItem["source"] } {
  const team = new Set(teamIds);
  const explicit = (groupedRows.get(signatureKey(offeringId, meeting)) ?? [])
    .map((row) => row.lecturerId)
    .filter((id) => team.has(id));

  if (explicit.length > 0) {
    return { lecturerIds: [...new Set(explicit)], source: "EXPLICIT" };
  }
  if (!offeringHasCurrentExplicitAssignments && teamIds.length === 1) {
    return { lecturerIds: [teamIds[0]!], source: "SOLE_LECTURER_DEFAULT" };
  }
  return { lecturerIds: [], source: "UNASSIGNED" };
}

export function scopeOfferingsWithAssignmentRows(
  offerings: OfferingView[],
  lecturerId: string | undefined,
  rows: StoredMeetingLecturerAssignment[],
): OfferingView[] {
  if (!lecturerId) return offerings;
  const groupedRows = rowsBySignature(rows);

  return offerings.map((offering) => {
    const teamIds = teamIdsFromOffering(offering);
    const hasExplicit = hasCurrentExplicitAssignment(offering.id, offering.meetings, groupedRows);
    return {
      ...offering,
      meetings: offering.meetings.filter((meeting) =>
        effectiveMeetingLecturerIds(
          offering.id,
          meeting,
          teamIds,
          groupedRows,
          hasExplicit,
        ).lecturerIds.includes(lecturerId),
      ),
    };
  });
}

export function scopeWorkloadWithAssignmentRows(
  summary: LecturerWorkloadSummary,
  lecturerId: string,
  rows: StoredMeetingLecturerAssignment[],
  teamStates: OfferingTeamState[],
): LecturerWorkloadSummary {
  const groupedRows = rowsBySignature(rows);
  const teamByOffering = new Map(teamStates.map((state) => [state.id, state] as const));
  const scheduleRowsByOffering = new Map<string, typeof summary.scheduleRows>();
  for (const row of summary.scheduleRows) {
    const list = scheduleRowsByOffering.get(row.offeringId) ?? [];
    list.push(row);
    scheduleRowsByOffering.set(row.offeringId, list);
  }

  const hasExplicitByOffering = new Map<string, boolean>();
  for (const [offeringId, meetingRows] of scheduleRowsByOffering) {
    hasExplicitByOffering.set(
      offeringId,
      hasCurrentExplicitAssignment(offeringId, meetingRows, groupedRows),
    );
  }

  const scheduleRows = summary.scheduleRows.filter((row) => {
    const teamIds = teamIdsFromState(teamByOffering.get(row.offeringId));
    return effectiveMeetingLecturerIds(
      row.offeringId,
      row,
      teamIds,
      groupedRows,
      hasExplicitByOffering.get(row.offeringId) ?? false,
    ).lecturerIds.includes(lecturerId);
  });

  const assignedOfferingIds = new Set(scheduleRows.map((row) => row.offeringId));
  const workloadRows = summary.rows.filter((row) => assignedOfferingIds.has(row.offeringId));
  const totalsByWeek = new Map<string, { term: string; week: number; totalContactHours: number }>();
  for (const row of workloadRows) {
    const key = `${row.term}\u0000${row.week}`;
    const current = totalsByWeek.get(key) ?? { term: row.term, week: row.week, totalContactHours: 0 };
    current.totalContactHours += row.totalContactHours;
    totalsByWeek.set(key, current);
  }
  const weeklyTotals = [...totalsByWeek.values()].sort(
    (a, b) => b.term.localeCompare(a.term) || a.week - b.week,
  );

  return {
    ...summary,
    scheduleRows,
    scheduledWeeklyHours:
      Math.round(scheduleRows.reduce((total, row) => total + row.durationHours, 0) * 100) / 100,
    rows: workloadRows,
    weeklyTotals,
    peakWeeklyHours: Math.max(0, ...weeklyTotals.map((week) => week.totalContactHours)),
    totalHours: workloadRows.reduce((total, row) => total + row.totalContactHours, 0),
  };
}

async function assignmentRowsForOfferingIds(offeringIds: string[]): Promise<StoredMeetingLecturerAssignment[]> {
  if (offeringIds.length === 0) return [];
  return prisma.$queryRaw<StoredMeetingLecturerAssignment[]>(Prisma.sql`
    SELECT
      "offeringId",
      "dayOfWeek",
      "startTime",
      "endTime",
      "activityType",
      "lecturerId"
    FROM pms_attendance."OfferingMeetingLecturerAssignment"
    WHERE "offeringId" IN (${Prisma.join(offeringIds)})
  `);
}

async function teamStatesForOfferingIds(offeringIds: string[]): Promise<OfferingTeamState[]> {
  if (offeringIds.length === 0) return [];
  return prisma.offering.findMany({
    where: { id: { in: offeringIds } },
    select: {
      id: true,
      lecturerId: true,
      coLecturers: { select: { lecturerId: true } },
    },
  });
}

async function assignmentViewForOffering(offering: OfferingView): Promise<MeetingLecturerAssignmentsView> {
  const rows = await assignmentRowsForOfferingIds([offering.id]);
  const groupedRows = rowsBySignature(rows);
  const teamIds = teamIdsFromOffering(offering);
  const hasExplicit = hasCurrentExplicitAssignment(offering.id, offering.meetings, groupedRows);

  return {
    offeringId: offering.id,
    meetings: offering.meetings.map((meeting) => ({
      meetingId: meeting.id,
      ...effectiveMeetingLecturerIds(offering.id, meeting, teamIds, groupedRows, hasExplicit),
    })),
  };
}

export const meetingLecturerAssignmentService = {
  async scopeOfferings(offerings: OfferingView[], lecturerId?: string): Promise<OfferingView[]> {
    if (!lecturerId || offerings.length === 0) return offerings;
    const rows = await assignmentRowsForOfferingIds(offerings.map((offering) => offering.id));
    return scopeOfferingsWithAssignmentRows(offerings, lecturerId, rows);
  },

  async scopeWorkload(
    summary: LecturerWorkloadSummary,
    lecturerId: string,
  ): Promise<LecturerWorkloadSummary> {
    const offeringIds = [...new Set(summary.scheduleRows.map((row) => row.offeringId))];
    const [rows, teamStates] = await Promise.all([
      assignmentRowsForOfferingIds(offeringIds),
      teamStatesForOfferingIds(offeringIds),
    ]);
    return scopeWorkloadWithAssignmentRows(summary, lecturerId, rows, teamStates);
  },

  async get(offeringId: string): Promise<MeetingLecturerAssignmentsView> {
    const offering = await offeringService.getById(offeringId);
    if (!offering) throw new MeetingLecturerAssignmentNotFoundError("Offering not found");
    return assignmentViewForOffering(offering);
  },

  async replace(
    offeringId: string,
    actorUserId: string,
    input: ReplaceMeetingLecturerAssignments,
  ): Promise<MeetingLecturerAssignmentsView> {
    const offering = await offeringService.getById(offeringId);
    if (!offering) throw new MeetingLecturerAssignmentNotFoundError("Offering not found");

    const meetingById = new Map(offering.meetings.map((meeting) => [meeting.id, meeting] as const));
    const allowedLecturerIds = new Set(teamIdsFromOffering(offering));
    for (const assignment of input.assignments) {
      if (!meetingById.has(assignment.meetingId)) {
        throw new MeetingLecturerAssignmentValidationError("One or more meetings do not belong to this offering");
      }
      const invalidLecturer = assignment.lecturerIds.find((id) => !allowedLecturerIds.has(id));
      if (invalidLecturer) {
        throw new MeetingLecturerAssignmentValidationError(
          "Meeting lecturers must belong to the offering teaching team",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM pms_attendance."OfferingMeetingLecturerAssignment"
        WHERE "offeringId" = ${offeringId}
      `);

      for (const assignment of input.assignments) {
        const meeting = meetingById.get(assignment.meetingId)!;
        for (const lecturerId of assignment.lecturerIds) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO pms_attendance."OfferingMeetingLecturerAssignment" (
              "offeringId", "dayOfWeek", "startTime", "endTime", "activityType",
              "lecturerId", "assignedByUserId"
            ) VALUES (
              ${offeringId}, ${meeting.dayOfWeek}, ${meeting.startTime}, ${meeting.endTime},
              ${meeting.activityType}, ${lecturerId}, ${actorUserId}
            )
            ON CONFLICT DO NOTHING
          `);
        }
      }
    });

    return assignmentViewForOffering(offering);
  },

  async assertLecturerOwnsOccurrences(
    lecturerId: string,
    occurrences: Array<{ offeringId: string; offeringMeetingId: string }>,
  ): Promise<void> {
    const offeringIds = [...new Set(occurrences.map((item) => item.offeringId))];
    const offerings = await Promise.all(offeringIds.map((id) => offeringService.getById(id)));
    const offeringById = new Map(
      offerings.filter((offering): offering is OfferingView => Boolean(offering)).map((offering) => [offering.id, offering] as const),
    );

    for (const occurrence of occurrences) {
      const offering = offeringById.get(occurrence.offeringId);
      if (!offering) throw new MeetingLecturerAssignmentNotFoundError("Offering not found");
      const view = await assignmentViewForOffering(offering);
      const meeting = view.meetings.find((item) => item.meetingId === occurrence.offeringMeetingId);
      if (!meeting) throw new MeetingLecturerAssignmentNotFoundError("Offering meeting not found");
      if (!meeting.lecturerIds.includes(lecturerId)) {
        throw new MeetingLecturerAssignmentAuthorizationError(
          "You can request teaching leave only for a class time assigned to you",
        );
      }
    }
  },
};
