import { prisma } from "../../core/db/prisma.ts";

export interface ApprovedStudentScheduleImpactSource {
  occurrenceId: string;
  offeringId: string;
  offeringMeetingId: string;
  sessionDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  scheduledRoom: string | null;
}

type ApprovedImpactRow = Omit<ApprovedStudentScheduleImpactSource, "sessionDate"> & {
  sessionDate: Date;
};

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Read-only, privacy-safe approved teaching-session impact projection.
 *
 * Authorization is data-scoped here as defence in depth: only an Active Student
 * with an exact Enrollment in the affected Offering can receive a row. Pending,
 * rejected, and change-requested leave never appears because both the canonical
 * occurrence approval link and APPROVED request status are required.
 */
export const studentScheduleImpactService = {
  async forStudent(userId: string): Promise<ApprovedStudentScheduleImpactSource[]> {
    const rows = await prisma.$queryRaw<ApprovedImpactRow[]>`
      SELECT
        occurrence."id" AS "occurrenceId",
        occurrence."offeringId" AS "offeringId",
        occurrence."offeringMeetingId" AS "offeringMeetingId",
        occurrence."sessionDate" AS "sessionDate",
        occurrence."scheduledStartTime" AS "scheduledStartTime",
        occurrence."scheduledEndTime" AS "scheduledEndTime",
        occurrence."scheduledRoom" AS "scheduledRoom"
      FROM "pms_attendance"."TeachingSessionOccurrence" occurrence
      JOIN "pms_attendance"."TeachingLeaveRequest" leave
        ON leave."id" = occurrence."approvedLeaveRequestId"
       AND leave."status" = 'APPROVED'
      JOIN "pms_attendance"."TeachingLeaveRequestOccurrence" link
        ON link."requestId" = leave."id"
       AND link."occurrenceId" = occurrence."id"
      JOIN "public"."Student" student
        ON student."userId" = ${userId}
       AND student."status" = 'Active'
      JOIN "public"."Enrollment" enrollment
        ON enrollment."studentId" = student."id"
       AND enrollment."offeringId" = occurrence."offeringId"
      ORDER BY occurrence."sessionDate", occurrence."scheduledStartTime", occurrence."id"
    `;

    return rows.map((row) => ({
      ...row,
      sessionDate: dateOnly(row.sessionDate),
    }));
  },
};
