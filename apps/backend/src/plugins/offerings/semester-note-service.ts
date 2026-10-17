import type { SaveStudentSemesterNoteInput, StudentSemesterNoteView } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class SemesterNoteConflictError extends Error {}
export class SemesterNoteNotFoundError extends Error {}
export class SemesterNoteReadOnlyError extends Error {}

function toView(row: {
  studentId: string;
  note: string;
  version: number;
  updatedAt: Date;
}): StudentSemesterNoteView {
  return {
    studentId: row.studentId,
    note: row.note,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A single read for all Offering notes, independent of the selected attendance date. */
export const semesterNoteService = {
  async list(offeringId: string): Promise<StudentSemesterNoteView[]> {
    const notes = await prisma.offeringStudentSemesterNote.findMany({
      where: { offeringId },
      select: { studentId: true, note: true, version: true, updatedAt: true },
    });
    return notes.map(toView);
  },

  async save(
    offeringId: string,
    studentId: string,
    input: SaveStudentSemesterNoteInput,
    actorId: string,
  ): Promise<StudentSemesterNoteView> {
    try {
      return await prisma.$transaction(async (tx) => {
        const offering = await tx.offering.findUnique({
          where: { id: offeringId },
          select: { status: true },
        });
        if (!offering) throw new SemesterNoteNotFoundError("Offering not found");
        if (offering.status === "Completed") {
          throw new SemesterNoteReadOnlyError("Notes for a completed offering are read-only");
        }
        // No inferred cohort membership: the exact course Offering's roster is authoritative.
        const enrollment = await tx.enrollment.findFirst({
          where: { offeringId, studentId },
          select: { id: true },
        });
        if (!enrollment) {
          throw new SemesterNoteNotFoundError("Student is not enrolled in this offering");
        }

        const current = await tx.offeringStudentSemesterNote.findUnique({
          where: { offeringId_studentId: { offeringId, studentId } },
        });
        if ((current?.version ?? 0) !== input.expectedVersion) {
          throw new SemesterNoteConflictError("Student note changed. Reload before saving your edit.");
        }
        if (!current && !input.note) {
          return { studentId, note: "", version: 0, updatedAt: null };
        }
        if (current?.note === input.note) {
          return toView(current);
        }

        const saved = current
          ? await (async () => {
              const updated = await tx.offeringStudentSemesterNote.updateMany({
                where: { id: current.id, version: current.version },
                data: {
                  note: input.note,
                  version: { increment: 1 },
                  updatedById: actorId,
                },
              });
              if (updated.count !== 1) {
                throw new SemesterNoteConflictError("Student note changed. Reload before saving your edit.");
              }
              return tx.offeringStudentSemesterNote.findUniqueOrThrow({ where: { id: current.id } });
            })()
          : await tx.offeringStudentSemesterNote.create({
              data: { offeringId, studentId, note: input.note, updatedById: actorId },
            });

        await tx.offeringStudentSemesterNoteRevision.create({
          data: {
            noteId: saved.id,
            version: saved.version,
            previousNote: current?.note ?? "",
            nextNote: input.note,
            actorId,
          },
        });
        return toView(saved);
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002" || code === "P2034") {
        throw new SemesterNoteConflictError("Student note changed. Reload before saving your edit.");
      }
      throw error;
    }
  },
};
