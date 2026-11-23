import type { AppointProgrammeHeadInput, EndProgrammeHeadInput, ProgrammeHeadOverview } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

/**
 * The Head of Program is an academic appointment. The associated coordinator
 * capability is programme-scoped; it is never a replacement for a lecturer role.
 * Only the auth router's admin-only, authenticated endpoints call these writes.
 */
export class ProgrammeHeadError extends Error {}

export const programmeHeadService = {
  async overview(programmeId: string): Promise<ProgrammeHeadOverview> {
    const rows = await prisma.programmeHeadAppointment.findMany({
      where: { programmeId },
      orderBy: [{ appointedAt: "desc" }, { id: "desc" }],
      include: {
        lecturer: { select: { name: true, email: true } },
        appointedBy: { select: { name: true } },
        endedBy: { select: { name: true } },
      },
    });
    const appointments = rows.map((row) => ({
      id: row.id,
      lecturerId: row.lecturerId,
      lecturerName: row.lecturer.name,
      lecturerEmail: row.lecturer.email,
      appointedAt: row.appointedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      appointedByName: row.appointedBy.name,
      endedByName: row.endedBy?.name ?? null,
      reference: row.reference,
      coordinatorGranted: row.coordinatorGranted,
    }));
    return {
      programmeId,
      current: appointments.find((row) => row.endedAt === null) ?? null,
      history: appointments,
    };
  },

  async appoint(input: AppointProgrammeHeadInput, actorId: string): Promise<ProgrammeHeadOverview> {
    await prisma.$transaction(async (tx) => {
      const programme = await tx.programme.findUnique({ where: { id: input.programmeId }, select: { id: true } });
      if (!programme) throw new ProgrammeHeadError("Programme not found");

      // Serialize concurrent appoint/end operations using the programme row
      // lock. The database's partial unique index is a second line of defense.
      await tx.programme.update({
        where: { id: input.programmeId },
        data: { updatedAt: new Date() },
        select: { id: true },
      });

      const lecturer = await tx.user.findUnique({
        where: { id: input.lecturerId },
        select: { id: true, authId: true },
      });
      if (!lecturer) throw new ProgrammeHeadError("Lecturer not found");
      if (!lecturer.authId) {
        throw new ProgrammeHeadError("Invite and activate the lecturer's PMS login before appointing them");
      }

      const lecturerGrant = await tx.userRoleAssignment.findFirst({
        where: {
          userId: input.lecturerId,
          programmeId: input.programmeId,
          role: { slug: "lecturer" },
        },
        select: { userId: true },
      });
      if (!lecturerGrant) throw new ProgrammeHeadError("The selected user is not a lecturer in this programme");

      const coordinatorRole = await tx.role.findUnique({
        where: { slug: "program_coordinator" },
        select: { id: true },
      });
      if (!coordinatorRole) throw new ProgrammeHeadError("Program Coordinator role is not installed");

      const current = await tx.programmeHeadAppointment.findFirst({
        where: { programmeId: input.programmeId, endedAt: null },
      });
      if (current?.lecturerId === input.lecturerId) return;

      const existingCoordinator = await tx.userRoleAssignment.findUnique({
        where: { userId_roleId: { userId: input.lecturerId, roleId: coordinatorRole.id } },
        select: { programmeId: true },
      });
      if (existingCoordinator && existingCoordinator.programmeId !== input.programmeId) {
        throw new ProgrammeHeadError("Coordinator grant belongs to another programme");
      }

      const now = new Date();
      if (current) {
        await tx.programmeHeadAppointment.update({
          where: { id: current.id },
          data: { endedAt: now, endedById: actorId },
        });
        // Never revoke an independently existing coordinator grant.
        if (current.coordinatorGranted) {
          await tx.userRoleAssignment.deleteMany({
            where: {
              userId: current.lecturerId,
              roleId: coordinatorRole.id,
              programmeId: input.programmeId,
            },
          });
        }
      }

      if (!existingCoordinator) {
        await tx.userRoleAssignment.create({
          data: {
            userId: input.lecturerId,
            roleId: coordinatorRole.id,
            programmeId: input.programmeId,
          },
        });
      }

      await tx.programmeHeadAppointment.create({
        data: {
          programmeId: input.programmeId,
          lecturerId: input.lecturerId,
          appointedById: actorId,
          appointedAt: now,
          reference: input.reference || null,
          coordinatorGranted: !existingCoordinator,
        },
      });
    });
    return this.overview(input.programmeId);
  },

  async end(input: EndProgrammeHeadInput, actorId: string): Promise<ProgrammeHeadOverview> {
    await prisma.$transaction(async (tx) => {
      const programme = await tx.programme.findUnique({ where: { id: input.programmeId }, select: { id: true } });
      if (!programme) throw new ProgrammeHeadError("Programme not found");
      await tx.programme.update({
        where: { id: input.programmeId },
        data: { updatedAt: new Date() },
        select: { id: true },
      });
      const current = await tx.programmeHeadAppointment.findFirst({
        where: { programmeId: input.programmeId, endedAt: null },
      });
      if (!current) throw new ProgrammeHeadError("There is no active Head of Program to end");
      await tx.programmeHeadAppointment.update({
        where: { id: current.id },
        data: { endedAt: new Date(), endedById: actorId },
      });
      if (current.coordinatorGranted) {
        await tx.userRoleAssignment.deleteMany({
          where: {
            userId: current.lecturerId,
            programmeId: input.programmeId,
            role: { slug: "program_coordinator" },
          },
        });
      }
    });
    return this.overview(input.programmeId);
  },
};
