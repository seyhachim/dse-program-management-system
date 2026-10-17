import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  SemesterNoteConflictError,
  SemesterNoteNotFoundError,
  SemesterNoteReadOnlyError,
  semesterNoteService,
} from "./semester-note-service.ts";

// ONLY enable on a disposable, migrated integration database.
// Append-only audit rows deliberately make deletion of test history impossible.
const describeDb = process.env.SEMESTER_NOTE_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb("private semester note persistence and audit", () => {
  test("creates, edits, clears, versions and audits without touching attendance", async () => {
    const suffix = crypto.randomUUID();
    const actor = await prisma.user.create({
      data: { name: "Semester Notes Test Lecturer", email: `semnote-${suffix}@dse.invalid` },
    });
    const student = await prisma.student.create({
      data: {
        name: "Semester Notes Student", studentId: `SN-${suffix}`,
        email: `semnote-student-${suffix}@dse.invalid`, status: "Active",
      },
    });
    const course = await prisma.course.create({
      data: { code: `SN-${suffix.slice(0, 8)}`, title: "Semester notes isolated test", programmeId: "dse" },
    });
    const offering = await prisma.offering.create({
      data: { courseId: course.id, lecturerId: actor.id, term: `2026-SN-${suffix}`, sectionCode: "A", status: "Active" },
    });
    await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });

    expect(await semesterNoteService.list(offering.id)).toEqual([]);
    const first = await semesterNoteService.save(offering.id, student.id, {
      note: "Needs help with exercises", expectedVersion: 0,
    }, actor.id);
    expect(first).toMatchObject({ studentId: student.id, note: "Needs help with exercises", version: 1 });
    expect(first.updatedAt).not.toBeNull();

    const second = await semesterNoteService.save(offering.id, student.id, {
      note: "Discussed new approach", expectedVersion: 1,
    }, actor.id);
    expect(second.version).toBe(2);
    expect(await semesterNoteService.list(offering.id)).toEqual([second]);

    // A stale lecturer session cannot overwrite another lecturer's newer note.
    expect(semesterNoteService.save(offering.id, student.id, {
      note: "stale overwrite", expectedVersion: 1,
    }, actor.id)).rejects.toBeInstanceOf(SemesterNoteConflictError);

    // Same text and same version are idempotent and create no new audit entry.
    expect((await semesterNoteService.save(offering.id, student.id, {
      note: "Discussed new approach", expectedVersion: 2,
    }, actor.id)).version).toBe(2);

    const clear = await semesterNoteService.save(offering.id, student.id, {
      note: "", expectedVersion: 2,
    }, actor.id);
    expect(clear).toMatchObject({ note: "", version: 3 });

    const stored = await prisma.offeringStudentSemesterNote.findUniqueOrThrow({
      where: { offeringId_studentId: { offeringId: offering.id, studentId: student.id } },
      include: { revisions: { orderBy: { version: "asc" } } },
    });
    expect(stored.revisions.map((row) => ({
      version: row.version, before: row.previousNote, after: row.nextNote, actor: row.actorId,
    }))).toEqual([
      { version: 1, before: "", after: "Needs help with exercises", actor: actor.id },
      { version: 2, before: "Needs help with exercises", after: "Discussed new approach", actor: actor.id },
      { version: 3, before: "Discussed new approach", after: "", actor: actor.id },
    ]);

    expect(prisma.offeringStudentSemesterNoteRevision.delete({
      where: { id: stored.revisions[0]!.id },
    })).rejects.toThrow();

    expect(semesterNoteService.save(offering.id, crypto.randomUUID(), {
      note: "Not a roster member", expectedVersion: 0,
    }, actor.id)).rejects.toBeInstanceOf(SemesterNoteNotFoundError);

    await prisma.offering.update({ where: { id: offering.id }, data: { status: "Completed" } });
    expect(semesterNoteService.save(offering.id, student.id, {
      note: "Cannot edit historical note", expectedVersion: 3,
    }, actor.id)).rejects.toBeInstanceOf(SemesterNoteReadOnlyError);
    expect((await semesterNoteService.list(offering.id))[0]?.version).toBe(3);

    // Academic evidence remains independent; this test never writes an AttendanceSession.
  }, 60000);
});
