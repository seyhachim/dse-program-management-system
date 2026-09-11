import {
  PortalScheduleImpactSchema,
  type PortalScheduleImpact,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

export class StudentScheduleImpactAccessError extends Error {}

interface OfferingsScheduleImpactReadContract {
  studentScheduleImpacts: {
    forStudent(userId: string): Promise<Array<{
      occurrenceId: string;
      offeringId: string;
      offeringMeetingId: string;
      sessionDate: string;
      scheduledStartTime: string;
      scheduledEndTime: string;
      scheduledRoom: string | null;
    }>>;
  };
}

async function assertActivePortalStudent(userId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { status: true, studentId: true, email: true },
  });
  if (!student || student.status !== "Active" || !student.studentId || !student.email) {
    throw new StudentScheduleImpactAccessError(
      "No active student portal profile is linked to this account",
    );
  }
}

export const studentScheduleImpactProjectionService = {
  async list(userId: string): Promise<PortalScheduleImpact[]> {
    await assertActivePortalStudent(userId);
    const offerings = registry.get<OfferingsScheduleImpactReadContract>("offerings").service;
    const impacts = await offerings.studentScheduleImpacts.forStudent(userId);

    return impacts.map((impact) => PortalScheduleImpactSchema.parse({
      occurrenceId: impact.occurrenceId,
      offeringId: impact.offeringId,
      meetingId: impact.offeringMeetingId,
      sessionDate: impact.sessionDate,
      state: "cancelled",
      originalStartTime: impact.scheduledStartTime,
      originalEndTime: impact.scheduledEndTime,
      originalRoom: impact.scheduledRoom,
    }));
  },
};
