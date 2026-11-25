import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import type { AuthUser } from "../auth/token.ts";
import { createExamVariantManagementService, ExamVariantAccessError, ExamVariantConflictError } from "./exam-variant-management.ts";

const dbDescribe = process.env.EXAM_VARIANT_DB_TESTS === "1" ? describe : describe.skip;
function assertCiDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.CI !== "true" || !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/dse_ci" || url.username !== "ci" || url.searchParams.get("schema") !== "public") {
    throw new Error("Exam management tests require the isolated dse_ci database");
  }
}
function auth(id: string): AuthUser {
  // Deliberately forged/stale claims to prove the service uses live DB grants.
  return { id, email: "synthetic@example.invalid", roles: ["admin"], programmeRoles: [{ role: "admin", programmeId: null }] };
}

dbDescribe("exam variant management (#1371 Phase 2B)", () => {
  test("live grants, signed moderation, exact resolution, concurrent assignment and immutable history", async () => {
    assertCiDatabase();
    const db = new PrismaClient();
    const service = createExamVariantManagementService(db, randomBytes(32));
    const suffix = randomUUID();
    try {
      // Committed synthetic fixtures are necessary to exercise independent
      // serializable transactions. This disposable CI database is destroyed by CI.
      const f = await db.$transaction(async (tx) => {
        const lecturerRole = await tx.role.findUniqueOrThrow({ where: { slug: "lecturer" } });
        const coordinatorRole = await tx.role.findUniqueOrThrow({ where: { slug: "program_coordinator" } });
        const createUser = (label: string) => tx.user.create({ data: { name: "Synthetic " + label, email: label + "-" + suffix + "@example.invalid" } });
        const teacher = await createUser("teacher");
        const reviewer = await createUser("reviewer");
        const otherTeacher = await createUser("otherteacher");
        const outsider = await createUser("outsider");
        await tx.userRoleAssignment.createMany({ data: [
          { userId: teacher.id, roleId: lecturerRole.id, programmeId: "dse" },
          { userId: teacher.id, roleId: coordinatorRole.id, programmeId: "dse" },
          { userId: reviewer.id, roleId: coordinatorRole.id, programmeId: "dse" },
          { userId: otherTeacher.id, roleId: lecturerRole.id, programmeId: "dse" },
        ] });
        const course = await tx.course.create({ data: { programmeId: "dse", code: "EX-SVC-" + suffix, title: "Synthetic service exam" } });
        const spec = await tx.courseSpec.create({ data: { courseId: course.id, reviewStatus: "Approved", approvedAt: new Date(),
          clos: { create: [{ order: 0, description: "Synthetic analysis" }, { order: 1, description: "Synthetic practice" }] },
          assessmentItems: { create: { id: "exam", order: 0, name: "Synthetic exam", type: "Exam", mode: "Individual", status: "Active", weight: 100, cloCodes: ["CLO1", "CLO2"] } } } });
        const offering = await tx.offering.create({ data: { courseId: course.id, courseSpecId: spec.id, term: suffix, sectionCode: "M1", lecturerId: teacher.id, status: "Active" } });
        const other = await tx.offering.create({ data: { courseId: course.id, courseSpecId: spec.id, term: suffix, sectionCode: "M2", lecturerId: otherTeacher.id, status: "Active" } });
        const student = await tx.student.create({ data: { name: "Synthetic student", studentId: "EX-SVC-" + suffix } });
        const enrolled = await tx.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });
        const foreign = await tx.enrollment.create({ data: { offeringId: other.id, studentId: student.id } });
        const instrument = await tx.rubric.create({ data: { name: "Synthetic scheme", type: "assessment", instrumentKind: "marking_scheme", status: "Draft", ownerId: teacher.id,
          criterionRows: { create: [{ id: "Q1", name: "Q1", order: 0, maxPoints: 70 }, { id: "Q2", name: "Q2", order: 1, maxPoints: 30 }] } } });
        await tx.rubric.update({ where: { id: instrument.id }, data: { status: "Active" } });
        return { teacher, reviewer, otherTeacher, outsider, spec, offering, other, enrolled, foreign, instrument, coordinatorRole };
      });
      const teacher = auth(f.teacher.id);
      const reviewer = auth(f.reviewer.id);
      const outsider = auth(f.outsider.id);
      const otherTeacher = auth(f.otherTeacher.id);
      const scope = { offeringId: f.offering.id, assessmentItemId: "exam" };
      const mappings = [{ questionId: "Q1", cloCode: "CLO1", evidence: "direct" }, { questionId: "Q2", cloCode: "CLO2", evidence: "supporting" }];
      const prepare = { ...scope, variantId: "A", revision: 1, instrumentId: f.instrument.id, examMaximum: 100, mappings };
      await expect(service.prepare(outsider, prepare)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.prepare(otherTeacher, prepare)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.prepare(teacher, { ...prepare, mappings: [mappings[0], mappings[0]] })).rejects.toBeInstanceOf(ExamVariantConflictError);
      await expect(service.prepare(teacher, { ...prepare, mappings: [{ ...mappings[0], cloCode: "CLO9" }, mappings[1]] })).rejects.toBeInstanceOf(ExamVariantConflictError);
      const a = await service.prepare(teacher, prepare);
      expect(a.snapshot.questions[0]?.maxPoints).toBe(70);
      const approval = { token: a.token, expectedHash: a.snapshot.variantHash, moderationRef: "synthetic-moderation-A" };
      await expect(service.approve(teacher, approval)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.approve(outsider, approval)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.approve(reviewer, { ...approval, token: "x" + a.token })).rejects.toBeInstanceOf(ExamVariantAccessError);
      const b = await service.prepare(teacher, { ...prepare, variantId: "B" });
      await expect(service.approve(reviewer, { ...approval, expectedHash: b.snapshot.variantHash })).rejects.toBeInstanceOf(ExamVariantConflictError);
      expect(await service.approve(reviewer, approval)).toEqual(a.snapshot);
      await expect(service.approve(reviewer, approval)).rejects.toBeInstanceOf(ExamVariantConflictError);
      await service.approve(reviewer, { token: b.token, expectedHash: b.snapshot.variantHash, moderationRef: "synthetic-moderation-B" });
      const initial = { ...scope, enrollmentId: f.enrolled.id, variantId: "A", variantHash: a.snapshot.variantHash,
        expectedRevision: 0, reason: "Actual paper confirmed", evidenceRef: "synthetic-script" };
      await expect(service.assign(outsider, initial)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.assign(reviewer, initial)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.assign(teacher, { ...initial, enrollmentId: f.foreign.id })).rejects.toBeInstanceOf(ExamVariantAccessError);
      const otherInput = { ...initial, offeringId: f.other.id, enrollmentId: f.foreign.id };
      await expect(service.assign(otherTeacher, otherInput)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await service.permitOffering(reviewer, { offeringId: f.other.id, assessmentItemId: "exam", variantId: "A", variantHash: a.snapshot.variantHash });
      await service.assign(otherTeacher, otherInput);
      const attempts = await Promise.allSettled([service.assign(teacher, initial), service.assign(teacher, initial)]);
      expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((x) => x.status === "rejected")).toHaveLength(1);
      const resolve = { ...scope, enrollmentId: f.enrolled.id };
      const first = await service.resolve(teacher, resolve);
      expect(first.assignment.revision).toBe(1);
      expect(first.snapshot).toEqual(a.snapshot);
      await expect(service.resolve(outsider, resolve)).rejects.toBeInstanceOf(ExamVariantAccessError);
      const correction = { ...initial, variantId: "B", variantHash: b.snapshot.variantHash, expectedRevision: 1, reason: "Correct actual paper" };
      const second = await service.assign(teacher, correction);
      expect(second.revision).toBe(2);
      await expect(service.assign(teacher, correction)).rejects.toBeInstanceOf(ExamVariantConflictError);
      expect((await service.resolve(reviewer, resolve)).snapshot).toEqual(b.snapshot);
      const events = await db.$queryRaw<Array<{ revision: number; actorId: string; previousVariantId: string | null; variantId: string }>>`
        SELECT revision,"actorId","previousVariantId","variantId" FROM exam_variant."ExamAssignmentEvent" WHERE "assignmentId"=${second.id} ORDER BY revision`;
      expect(events).toEqual([{ revision: 1, actorId: teacher.id, previousVariantId: null, variantId: "A" },
        { revision: 2, actorId: teacher.id, previousVariantId: "A", variantId: "B" }]);
      // Phase 2C: durable queue, one terminal decision, exact offering scope.
      const previewC = await service.prepare(teacher, { ...prepare, variantId: "C" });
      const requestC = { ...prepare, variantId: "C", expectedHash: previewC.snapshot.variantHash };
      await expect(service.submit(teacher, { ...requestC, expectedHash: a.snapshot.variantHash })).rejects.toBeInstanceOf(ExamVariantConflictError);
      const submitted = await service.submit(teacher, requestC);
      await expect(service.submit(teacher, requestC)).rejects.toBeInstanceOf(ExamVariantConflictError);
      const decision = { ...scope, submissionId: submitted.id, expectedHash: submitted.snapshot.variantHash,
        decision: "Approved", decisionRef: "synthetic-moderation-C" };
      await expect(service.decide(teacher, decision)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.decide(outsider, decision)).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.decide(reviewer, { ...decision, offeringId: f.other.id })).rejects.toBeInstanceOf(ExamVariantAccessError);
      await expect(service.decide(reviewer, { ...decision, expectedHash: a.snapshot.variantHash })).rejects.toBeInstanceOf(ExamVariantConflictError);
      const beforeReview = await service.workspace(teacher, scope);
      expect(beforeReview.submissions.find(s => s.id === submitted.id)?.status).toBe("Pending");
      expect(beforeReview.papers.some(p => p.variantId === "C")).toBe(false);
      await expect(service.workspace(outsider, scope)).rejects.toBeInstanceOf(ExamVariantAccessError);
      expect((await service.workspace(otherTeacher, { ...scope, offeringId: f.other.id })).submissions).toHaveLength(0);
      expect(await service.decide(reviewer, decision)).toEqual({ id: submitted.id, status: "Approved" });
      await expect(service.decide(reviewer, decision)).rejects.toBeInstanceOf(ExamVariantConflictError);
      const previewD = await service.prepare(teacher, { ...prepare, variantId: "D" });
      const requestD = { ...prepare, variantId: "D", expectedHash: previewD.snapshot.variantHash };
      const returned = await service.submit(teacher, requestD);
      await service.decide(reviewer, { ...decision, submissionId: returned.id, expectedHash: returned.snapshot.variantHash,
        decision: "Returned", decisionRef: "Review CLO mapping" });
      const resubmitted = await service.submit(teacher, requestD);
      expect(resubmitted.id).not.toBe(returned.id);
      const afterReview = await service.workspace(reviewer, scope);
      expect(afterReview.submissions.find(s => s.id === returned.id)?.status).toBe("Returned");
      expect(afterReview.papers.find(p => p.variantId === "C")?.permitted).toBe(true);
      await expect((async () => await db.$executeRaw`UPDATE exam_variant."ExamModerationSubmission" SET "decisionRef"='forged' WHERE id=${submitted.id}`)()).rejects.toThrow("Moderation submission is immutable");
      await expect((async () => await db.$executeRaw`DELETE FROM exam_variant."ExamModerationSubmission" WHERE id=${submitted.id}`)()).rejects.toThrow("Moderation history is immutable");
      const probeStudent = await db.student.create({ data: { name: "Synthetic batch probe", studentId: "BATCH-" + suffix } });
      const probe = await db.enrollment.create({ data: { offeringId: f.offering.id, studentId: probeStudent.id } });
      const entry = { enrollmentId: probe.id, variantId: "C", variantHash: submitted.snapshot.variantHash, expectedRevision: 0, reason: "Verified actual paper", evidenceRef: "synthetic-batch" };
      await expect(service.assignBulk(teacher, { ...scope, entries: [entry, entry] })).rejects.toBeInstanceOf(ExamVariantConflictError);
      await expect(service.assignBulk(teacher, { ...scope, entries: [entry, { ...entry, enrollmentId: f.foreign.id }] })).rejects.toBeInstanceOf(ExamVariantAccessError);
      expect((await service.workspace(teacher, scope)).roster.find(r => r.enrollmentId === probe.id)?.assignment).toBeNull();
      expect(await service.assignBulk(teacher, { ...scope, entries: [entry] })).toHaveLength(1);
      expect((await service.history(teacher, { ...scope, enrollmentId: probe.id }))[0]?.variantId).toBe("C");
      await expect(service.history(otherTeacher, { ...scope, enrollmentId: probe.id })).rejects.toBeInstanceOf(ExamVariantAccessError);
      const mark = await db.assessmentResult.create({ data: { enrollmentId: f.enrolled.id, courseSpecId: f.spec.id, assessmentItemId: "exam", score: 80, maxScore: 100 } });
      await expect(service.assign(teacher, { ...initial, expectedRevision: 2 })).rejects.toBeInstanceOf(ExamVariantConflictError);
      expect(await db.assessmentResult.findUniqueOrThrow({ where: { id: mark.id } })).toEqual(mark);
      await db.rubric.update({ where: { id: f.instrument.id }, data: { status: "Archived" } });
      expect((await service.resolve(teacher, resolve)).snapshot).toEqual(b.snapshot);
      await db.userRoleAssignment.delete({ where: { userId_roleId: { userId: f.reviewer.id, roleId: f.coordinatorRole.id } } });
      await expect(service.resolve(reviewer, resolve)).rejects.toBeInstanceOf(ExamVariantAccessError);
    } finally { await db.$disconnect(); }
  }, 90000);
});
