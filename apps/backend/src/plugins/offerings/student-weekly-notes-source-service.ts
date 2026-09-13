import { prisma } from "../../core/db/prisma.ts";

export interface StudentWeeklyNoteSource {
  date: string;
  classHeld: boolean;
  lecturerName: string | null;
  topic: string;
  learningSummary: string;
}

interface StudentWeeklyNoteRow {
  sessionDate: Date;
  classOccurred: boolean;
  actualLecturerName: string | null;
  actualTopic: string;
  learningSummary: string;
  scheduledStartTime: string;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const studentWeeklyNotesSourceService = {
  async forOffering(offeringId: string): Promise<StudentWeeklyNoteSource[]> {
    const rows = await prisma.$queryRaw<StudentWeeklyNoteRow[]>`
      SELECT
        occurrence."sessionDate",
        occurrence."scheduledStartTime",
        delivery."classOccurred",
        lecturer."name" AS "actualLecturerName",
        delivery."actualTopic",
        delivery."learningSummary"
      FROM "pms_attendance"."TeachingSessionDelivery" delivery
      JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence
        ON occurrence."id" = delivery."occurrenceId"
      LEFT JOIN "User" lecturer
        ON lecturer."id" = delivery."actualLecturerId"
      WHERE delivery."offeringId" = ${offeringId}
      ORDER BY occurrence."sessionDate" ASC, occurrence."scheduledStartTime" ASC
    `;

    return rows.map((row) => ({
      date: dateOnly(row.sessionDate),
      classHeld: row.classOccurred,
      lecturerName: row.actualLecturerName,
      topic: row.actualTopic,
      learningSummary: row.learningSummary,
    }));
  },
};

export type StudentWeeklyNotesSourceService = typeof studentWeeklyNotesSourceService;
