import { describe, expect, test } from "bun:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createExamVariantSnapshot } from "./exam-variant.ts";
import { rubricContentHash } from "./rubric-context.ts";

const enabled = process.env.EXAM_VARIANT_DB_TESTS === "1";
const dbDescribe = enabled ? describe : describe.skip;

// Fail closed: this suite is intentionally limited to the disposable CI DB.
function assertCiDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.CI !== "true" || !["localhost", "127.0.0.1"].includes(url.hostname)
      || url.pathname !== "/dse_ci" || url.username !== "ci" || url.searchParams.get("schema") !== "public") {
    throw new Error("Exam variant tests require the isolated dse_ci database");
  }
}

async function rejected(tx: Prisma.TransactionClient, operation: () => Promise<unknown>, expected: RegExp | "23503" | "23505" | "23514") {
  await tx.$executeRawUnsafe("SAVEPOINT exam_rejection");
  let failure: unknown;
  try { await operation(); } catch (error) { failure = error; }
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT exam_rejection");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT exam_rejection");
  expect(failure).toBeDefined();
  if (typeof expected === "string") {
    // Prisma P2010 exposes PostgreSQL SQLSTATE in meta.code; its text may contain only DETAIL.
    const rawFailure = failure as { code?: string; meta?: { code?: string } } | undefined;
    expect(rawFailure?.code).toBe("P2010");
    expect(rawFailure?.meta?.code).toBe(expected);
  } else {
    expect(String(failure)).toMatch(expected);
  }
}

dbDescribe("exam variant persistence (#1371 Phase 2A)", () => {
  test("composite scopes, immutable snapshots, assignment ledger, historical marks and private grants", async () => {
    assertCiDatabase();
    const prisma = new PrismaClient();
    const rollback = new Error("successful synthetic fixture rollback");
    const suffix = randomUUID();
    try {
      await prisma.$transaction(async (tx) => {
        const programme = await tx.programme.findUniqueOrThrow({ where: { id: "dse" } });
        const maker = await tx.user.create({ data: { name: "Synthetic author", email: `exam-maker-${suffix}@example.invalid` } });
        const reviewer = await tx.user.create({ data: { name: "Synthetic reviewer", email: `exam-reviewer-${suffix}@example.invalid` } });
        const course = await tx.course.create({ data: { programmeId: programme.id, code: `EX-${suffix}`, title: "Synthetic exam" } });
        const spec = await tx.courseSpec.create({ data: { courseId: course.id, reviewStatus: "Approved", approvedAt: new Date(),
          clos: { create: [{ order: 0, description: "Synthetic analysis" }, { order: 1, description: "Synthetic practice" }] },
          assessmentItems: { create: [
            { id: "exam", order: 0, name: "Synthetic exam", type: "Exam", mode: "Individual", status: "Active", weight: 25, cloCodes: ["CLO1", "CLO2"] },
            { id: "legacy", order: 1, name: "Legacy exam", type: "Exam", mode: "Individual", status: "Active", weight: 75, cloCodes: ["CLO1"] },
          ] } } });
        const draft = await tx.courseSpec.create({ data: { courseId: course.id, versionMajor: 2, reviewStatus: "Draft",
          assessmentItems: { create: { id: "exam", order: 0, name: "Draft exam", type: "Exam", weight: 25 } } } });
        const offering = await tx.offering.create({ data: { courseId: course.id, courseSpecId: spec.id, term: suffix, sectionCode: "M1", lecturerId: maker.id } });
        const other = await tx.offering.create({ data: { courseId: course.id, courseSpecId: spec.id, term: suffix, sectionCode: "M2", lecturerId: maker.id } });
        const unbound = await tx.offering.create({ data: { courseId: course.id, term: suffix, sectionCode: "unbound" } });
        const student = await tx.student.create({ data: { name: "Synthetic student", studentId: `EX-${suffix}` } });
        const enrollment = await tx.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });
        const foreignEnrollment = await tx.enrollment.create({ data: { offeringId: other.id, studentId: student.id } });
        const historic = await tx.assessmentResult.create({ data: { enrollmentId: enrollment.id, courseSpecId: spec.id, assessmentItemId: "legacy", score: 72, maxScore: 100 } });
        const configure = (specId: string, assessmentId: string, programmeId = programme.id) => tx.$executeRaw`
          INSERT INTO exam_variant."ExamConfiguration" ("courseSpecId","assessmentItemId","courseId","programmeId","examMaximum","createdById")
          VALUES (${specId},${assessmentId},${course.id},${programmeId},100,${maker.id})`;
        await rejected(tx, () => configure(draft.id, "exam"), /approved active individual/);
        await rejected(tx, () => configure(spec.id, "legacy"), /historical reconciliation/);
        await rejected(tx, () => configure(spec.id, "exam", "unrelated-programme"), "23503");
        await configure(spec.id, "exam");
        await rejected(tx, () => configure(spec.id, "exam"), "23505");

        const instrument = await tx.rubric.create({ data: {
          name: "Synthetic scheme", type: "assessment", instrumentKind: "marking_scheme", status: "Draft", ownerId: maker.id,
          criterionRows: { create: [{ id: "Q1", name: "Q1", order: 0, maxPoints: 70 }, { id: "Q2", name: "Q2", order: 1, maxPoints: 30 }] },
        }, include: { levelRows: true, criterionRows: true } });
        await tx.rubric.update({ where: { id: instrument.id }, data: { status: "Active" } });
        const scope = { programmeId: programme.id, courseSpecId: spec.id, assessmentItemId: "exam" };
        const questions = [{ questionId: "Q1", maxPoints: 70, cloCode: "CLO1", evidence: "direct" },
          { questionId: "Q2", maxPoints: 30, cloCode: "CLO2", evidence: "supporting" }];
        const a = createExamVariantSnapshot({ ...scope, variantId: "M1-A", revision: 1, instrumentId: instrument.id,
          instrumentHash: rubricContentHash(instrument), examMaximum: 100, questions });
        const b = createExamVariantSnapshot({ ...scope, variantId: "M1-B", revision: 1, instrumentId: instrument.id,
          instrumentHash: a.instrumentHash, examMaximum: 100, questions });
        const insertPaper = (v: typeof a, qs: unknown = v.questions, approver = reviewer.id) => tx.$executeRaw`
          INSERT INTO exam_variant."ExamPaperVersion" ("courseSpecId","assessmentItemId","variantId","revision","variantHash","instrumentId","instrumentHash","questions","preparedById","approvedById","moderationRef")
          VALUES (${spec.id},'exam',${v.variantId},${v.revision},${v.variantHash},${v.instrumentId},${v.instrumentHash},${JSON.stringify(qs)}::jsonb,${maker.id},${approver},'synthetic-moderation')`;
        await rejected(tx, () => insertPaper(a, a.questions, maker.id), "23514");
        await rejected(tx, () => insertPaper(a, [{ ...questions[0], maxPoints: 69 }, questions[1]]), /differs from instrument/);
        await rejected(tx, () => insertPaper(a, [{ ...questions[0], cloCode: "CLO9" }, questions[1]]), /active assessment CLO/);
        await rejected(tx, () => insertPaper(a, [questions[0], questions[0]]), /Duplicate or missing/);
        await rejected(tx, () => insertPaper(a, [{ ...questions[0], answer: "not allowed" }, questions[1]]), /Invalid question metadata/);
        await insertPaper(a); await insertPaper(b);
        await rejected(tx, () => insertPaper(a), "23505");
        await rejected(tx, () => tx.$executeRaw`UPDATE exam_variant."ExamPaperVersion" SET questions='[]'::jsonb WHERE "courseSpecId"=${spec.id}`, /immutable/);
        await rejected(tx, () => tx.$executeRaw`DELETE FROM exam_variant."ExamPaperVersion" WHERE "courseSpecId"=${spec.id}`, /immutable/);

        const permit = (offeringId: string, v: typeof a) => tx.$executeRaw`
          INSERT INTO exam_variant."ExamOfferingPermission" ("courseSpecId","assessmentItemId","courseId","programmeId","offeringId","variantId","variantHash","createdById")
          VALUES (${spec.id},'exam',${course.id},${programme.id},${offeringId},${v.variantId},${v.variantHash},${maker.id})`;
        await rejected(tx, () => permit(unbound.id, a), "23503");
        await permit(offering.id, a); await permit(offering.id, b);
        await permit(other.id, b);
        const assign = (id: string, enrollmentId: string, offeringId: string, v: typeof a) => tx.$executeRaw`
          INSERT INTO exam_variant."ExamPaperAssignment" (id,"enrollmentId","offeringId","courseSpecId","assessmentItemId","variantId","variantHash","actorId",reason,"evidenceRef")
          VALUES (${id},${enrollmentId},${offeringId},${spec.id},'exam',${v.variantId},${v.variantHash},${maker.id},'Actual paper confirmed','synthetic-script')`;
        const assignmentId = randomUUID();
        await rejected(tx, () => assign(randomUUID(), foreignEnrollment.id, offering.id, a), "23503");
        await rejected(tx, () => assign(randomUUID(), foreignEnrollment.id, other.id, a), "23503");
        await assign(assignmentId, enrollment.id, offering.id, a);
        await rejected(tx, () => assign(randomUUID(), enrollment.id, offering.id, a), "23505");
        await rejected(tx, () => tx.$executeRaw`UPDATE exam_variant."ExamPaperAssignment" SET revision=3,"variantId"=${b.variantId},"variantHash"=${b.variantHash} WHERE id=${assignmentId}`, /revision or variant change/);
        await tx.$executeRaw`UPDATE exam_variant."ExamPaperAssignment" SET revision=2,"variantId"=${b.variantId},"variantHash"=${b.variantHash},"actorId"=${reviewer.id},reason='Corrected actual paper' WHERE id=${assignmentId}`;
        const events = await tx.$queryRaw<Array<{ revision: number; previousVariantId: string | null; variantId: string; actorId: string }>>`
          SELECT revision,"previousVariantId","variantId","actorId" FROM exam_variant."ExamAssignmentEvent" WHERE "assignmentId"=${assignmentId} ORDER BY revision`;
        expect(events).toEqual([
          { revision: 1, previousVariantId: null, variantId: a.variantId, actorId: maker.id },
          { revision: 2, previousVariantId: a.variantId, variantId: b.variantId, actorId: reviewer.id },
        ]);
        await rejected(tx, () => tx.$executeRaw`UPDATE exam_variant."ExamAssignmentEvent" SET reason='forged' WHERE "assignmentId"=${assignmentId}`, /immutable/);
        await rejected(tx, () => tx.$executeRaw`DELETE FROM exam_variant."ExamAssignmentEvent" WHERE "assignmentId"=${assignmentId}`, /immutable/);
        await rejected(tx, () => tx.$executeRaw`INSERT INTO exam_variant."ExamAssignmentEvent" SELECT * FROM exam_variant."ExamAssignmentEvent" WHERE "assignmentId"=${assignmentId} AND revision=1`, /generated by assignment changes/);
        await rejected(tx, () => tx.$executeRaw`UPDATE public."Enrollment" SET "offeringId"=${unbound.id} WHERE id=${enrollment.id}`, "23503");
        await rejected(tx, () => tx.$executeRaw`UPDATE public."Offering" SET "courseSpecId"=NULL WHERE id=${offering.id}`, "23503");

        const result = await tx.assessmentResult.create({ data: { enrollmentId: enrollment.id, courseSpecId: spec.id, assessmentItemId: "exam", score: 80, maxScore: 100 } });
        await rejected(tx, () => tx.$executeRaw`UPDATE exam_variant."ExamPaperAssignment" SET revision=3,"variantId"=${a.variantId},"variantHash"=${a.variantHash} WHERE id=${assignmentId}`, /Existing result blocks/);
        const existingOther = await tx.assessmentResult.create({ data: { enrollmentId: foreignEnrollment.id, courseSpecId: spec.id, assessmentItemId: "exam", score: 64, maxScore: 100 } });
        await rejected(tx, () => assign(randomUUID(), foreignEnrollment.id, other.id, b), /Existing result blocks/);
        expect(await tx.assessmentResult.findUniqueOrThrow({ where: { id: result.id } })).toEqual(result);
        expect(await tx.assessmentResult.findUniqueOrThrow({ where: { id: existingOther.id } })).toEqual(existingOther);
        expect(await tx.assessmentResult.findUniqueOrThrow({ where: { id: historic.id } })).toEqual(historic);
        expect((await tx.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM exam_variant."ExamAssignmentEvent" WHERE "assignmentId"=${assignmentId}`)[0]?.count).toBe(2);

        const grants = await tx.$queryRaw<Array<{ role: string; denied: boolean }>>`
          SELECT rolname AS role, NOT has_schema_privilege(rolname,'exam_variant','USAGE')
            AND NOT has_table_privilege(rolname,'exam_variant."ExamPaperAssignment"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
            AND NOT has_function_privilege(rolname,'exam_variant.record_assignment_event()','EXECUTE') AS denied
          FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') ORDER BY rolname`;
        expect(grants).toHaveLength(3);
        expect(grants.every((g) => g.denied)).toBe(true);
        throw rollback; // rollback every synthetic row, including append-only events.
      }, { timeout: 60000 });
      throw new Error("Synthetic test unexpectedly committed");
    } catch (error) {
      if (error !== rollback) throw error;
    } finally { await prisma.$disconnect(); }
  }, 70000);
});
