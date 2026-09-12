import {
  OpenTeachingSlotStudentAssignmentSchema,
  type OpenTeachingSlotStudentAssignment,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

export class OpenSlotAssignmentAccessError extends Error {}

interface OfferingsOpenSlotReadContract {
  openTeachingSlots: {
    studentAssignments(userId: string): Promise<OpenTeachingSlotStudentAssignment[]>;
  };
}

async function assertActivePortalStudent(userId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { status: true, studentId: true, email: true },
  });
  if (!student || student.status !== "Active" || !student.studentId || !student.email) {
    throw new OpenSlotAssignmentAccessError("No active student portal profile is linked to this account");
  }
}

export const openSlotAssignmentProjectionService = {
  async list(userId: string): Promise<OpenTeachingSlotStudentAssignment[]> {
    await assertActivePortalStudent(userId);
    const offerings = registry.get<OfferingsOpenSlotReadContract>("offerings").service;
    const rows = await offerings.openTeachingSlots.studentAssignments(userId);
    return rows.map((row) => OpenTeachingSlotStudentAssignmentSchema.parse(row));
  },
};
