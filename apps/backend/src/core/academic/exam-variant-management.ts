import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/token.ts";
import { createExamVariantSnapshot, resolveExamVariant, verifyExamVariantSnapshot } from "./exam-variant.ts";
import { rubricContentHash } from "./rubric-context.ts";

const id = z.string().min(1).max(256).refine((s) => s.trim() === s);
const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
const hash = z.string().regex(/^exam-variant-v1:[a-f0-9]{64}$/);
const scopeSchema = z.object({ offeringId: id, assessmentItemId: id }).strict();
const versionSchema = scopeSchema.extend({ variantId: id, variantHash: hash });
const prepareSchema = scopeSchema.extend({
  variantId: id, revision: z.number().int().min(1).max(2147483647),
  instrumentId: id, examMaximum: z.number().finite().positive(),
  mappings: z.array(z.object({ questionId: id, cloCode: id, evidence: z.enum(["direct", "supporting"]) }).strict()).min(1).max(1000),
});
const approvalSchema = z.object({ token: z.string().min(1).max(500000), moderationRef: ref, expectedHash: hash }).strict();
const assignSchema = versionSchema.extend({
  enrollmentId: id, expectedRevision: z.number().int().min(0).max(2147483646),
  reason: z.string().trim().min(5).max(500), evidenceRef: ref,
});
const resolveSchema = scopeSchema.extend({ enrollmentId: id });
const proposalSchema = z.object({
  purpose: z.literal("exam-variant-proposal-v1"), offeringId: id,
  preparerId: id, expiresAt: z.number().int(), snapshot: z.unknown(),
}).strict();
type Scope = z.infer<typeof scopeSchema>;
type Version = z.infer<typeof versionSchema>;
type Tx = Prisma.TransactionClient;
type Snapshot = ReturnType<typeof createExamVariantSnapshot>;
type Config = { courseId: string; programmeId: string; examMaximum: number };
type Assignment = { id: string; revision: number; variantId: string; variantHash: string };
type Paper = {
  variantId: string; revision: number; variantHash: string; instrumentId: string;
  instrumentHash: string; questions: unknown; preparedById: string; approvedById: string; moderationRef: string;
};
export class ExamVariantAccessError extends Error {}
export class ExamVariantConflictError extends Error {}
function deny(): never { throw new ExamVariantAccessError("Exam scope or permission unavailable"); }
function conflict(message: string): never { throw new ExamVariantConflictError(message); }

type Grant = { programmeId: string | null; role: { slug: string; active: boolean; rolePermissions: { permission: { slug: string; active: boolean } }[] } };
function granted(grants: Grant[], programmeId: string, role: string, permission: string): boolean {
  return grants.some((g) => g.role.active && g.role.slug === role &&
    (g.programmeId === programmeId || (role === "admin" && g.programmeId === null)) &&
    g.role.rolePermissions.some((p) => p.permission.active && p.permission.slug === permission));
}
async function identity(tx: Tx, actorId: string) {
  const row = await tx.user.findUnique({ where: { id: actorId }, include: {
    roleAssignments: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
  } });
  if (!row || row.mustChangePassword) deny();
  return row;
}

// All entrypoints are server-internal; callers must supply an authenticated AuthUser,
// never an actor extracted from request JSON. Live scoped grants are reloaded here.
async function context(tx: Tx, actorId: string, input: Scope, access: "teacher" | "reviewer" | "read") {
  // Same offering-first lock order as Phase 2A; serializes competing assignments.
  await tx.$queryRaw`SELECT id FROM public."Offering" WHERE id=${input.offeringId} FOR UPDATE`;
  const offering = await tx.offering.findUnique({ where: { id: input.offeringId },
    include: { course: true, coLecturers: true } });
  if (!offering || !offering.courseSpecId) deny();
  const programmeId = offering.course.programmeId;
  if (!programmeId) deny();
  const user = await identity(tx, actorId);
  const grants = user.roleAssignments;
  const reviewer = ["admin", "program_coordinator"].some((role) => granted(grants, programmeId, role, "courses:manage"));
  const teacher = granted(grants, programmeId, "lecturer", "offerings:write") &&
    (offering.lecturerId === user.id || offering.coLecturers.some((c) => c.lecturerId === user.id));
  if (!(access === "reviewer" ? reviewer : access === "teacher" ? teacher : reviewer || teacher)) deny();
  // Lock the exact approved spec to serialize configuration/version creation across sections.
  await tx.$queryRaw`SELECT id FROM public."CourseSpec" WHERE id=${offering.courseSpecId} FOR UPDATE`;
  const spec = await tx.courseSpec.findUnique({ where: { id: offering.courseSpecId },
    include: { clos: true, assessmentItems: { where: { id: input.assessmentItemId } } } });
  const item = spec?.assessmentItems[0];
  if (!spec || spec.courseId !== offering.courseId || spec.reviewStatus !== "Approved" ||
    !item || item.status !== "Active" || item.mode !== "Individual" || item.type.toLowerCase() !== "exam" ||
    item.rubricId !== null || item.weight === null || !(item.weight > 0 && item.weight <= 100)) conflict("Approved individual exam required");
  const codes = spec.clos.filter((c) => c.status === "Active").map((c) => "CLO" + (c.order + 1));
  if (!item.cloCodes.length || new Set(item.cloCodes).size !== item.cloCodes.length ||
    item.cloCodes.some((c) => !codes.includes(c))) conflict("Invalid approved assessment CLO mapping");
  return { offering, user, teacher, reviewer, activeCloCodes: item.cloCodes,
    scope: { programmeId, courseSpecId: spec.id, assessmentItemId: item.id } };
}
type Context = Awaited<ReturnType<typeof context>>;
function writable(ctx: Context) {
  if (ctx.offering.status === "Completed") conflict("Completed offering is read-only");
}
async function config(tx: Tx, ctx: Context): Promise<Config | undefined> {
  const { courseSpecId, assessmentItemId, programmeId } = ctx.scope;
  const rows = await tx.$queryRaw<Config[]>`SELECT "courseId","programmeId","examMaximum" FROM exam_variant."ExamConfiguration"
    WHERE "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId}`;
  const row = rows[0];
  if (row && (row.courseId !== ctx.offering.courseId || row.programmeId !== programmeId)) conflict("Configuration scope mismatch");
  return row;
}
async function scheme(tx: Tx, instrumentId: string, active: boolean) {
  await tx.$queryRaw`SELECT id FROM public."Rubric" WHERE id=${instrumentId} FOR SHARE`;
  const row = await tx.rubric.findUnique({ where: { id: instrumentId },
    include: { levelRows: true, criterionRows: { orderBy: [{ order: "asc" }, { id: "asc" }] } } });
  if (!row || row.instrumentKind !== "marking_scheme" ||
    (row.status !== "Active" && (active || row.status !== "Archived")) ||
    row.levelRows.length || !row.criterionRows.length || row.criterionRows.length > 1000 ||
    new Set(row.criterionRows.map((q) => q.order)).size !== row.criterionRows.length ||
    row.criterionRows.some((q) => q.maxPoints === null || !Number.isFinite(q.maxPoints) || q.maxPoints <= 0)) conflict("Eligible marking scheme required");
  return row;
}
function validateQuestions(ctx: Context, row: Awaited<ReturnType<typeof scheme>>, snapshot: Snapshot) {
  if (snapshot.instrumentHash !== rubricContentHash(row) || snapshot.questions.length !== row.criterionRows.length ||
    snapshot.questions.some((q, i) => q.questionId !== row.criterionRows[i]?.id ||
      q.maxPoints !== row.criterionRows[i]?.maxPoints || !ctx.activeCloCodes.includes(q.cloCode))) conflict("Marking scheme or approved CLO mapping changed");
}
async function paper(tx: Tx, ctx: Context, version: Pick<Version, "variantId" | "variantHash">, active: boolean) {
  const { courseSpecId, assessmentItemId } = ctx.scope;
  const cfg = await config(tx, ctx);
  if (!cfg) conflict("Exam configuration unavailable");
  const rows = await tx.$queryRaw<Paper[]>`SELECT "variantId",revision,"variantHash","instrumentId","instrumentHash",questions,"preparedById","approvedById","moderationRef"
    FROM exam_variant."ExamPaperVersion" WHERE "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId}
    AND "variantId"=${version.variantId} AND "variantHash"=${version.variantHash}`;
  const p = rows[0];
  if (!p || p.preparedById === p.approvedById || !ref.safeParse(p.moderationRef).success) conflict("Approved exact paper unavailable");
  const snapshot = verifyExamVariantSnapshot({ ...ctx.scope, variantId: p.variantId, revision: p.revision,
    variantHash: p.variantHash, instrumentId: p.instrumentId, instrumentHash: p.instrumentHash,
    questions: p.questions, examMaximum: cfg.examMaximum });
  validateQuestions(ctx, await scheme(tx, snapshot.instrumentId, active), snapshot);
  return snapshot;
}
async function permission(tx: Tx, ctx: Context, v: Pick<Version, "variantId" | "variantHash">) {
  const { courseSpecId, assessmentItemId } = ctx.scope;
  const rows = await tx.$queryRaw<Array<{ present: number }>>`SELECT 1 AS present FROM exam_variant."ExamOfferingPermission"
    WHERE "offeringId"=${ctx.offering.id} AND "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId}
    AND "variantId"=${v.variantId} AND "variantHash"=${v.variantHash}`;
  return rows.length === 1;
}
async function permit(tx: Tx, ctx: Context, snapshot: Snapshot) {
  const { programmeId, courseSpecId, assessmentItemId } = ctx.scope;
  if (await permission(tx, ctx, snapshot)) conflict("Exact paper is already permitted");
  await tx.$executeRaw`INSERT INTO exam_variant."ExamOfferingPermission"
    ("courseSpecId","assessmentItemId","courseId","programmeId","offeringId","variantId","variantHash","createdById")
    VALUES (${courseSpecId},${assessmentItemId},${ctx.offering.courseId},${programmeId},${ctx.offering.id},
      ${snapshot.variantId},${snapshot.variantHash},${ctx.user.id})`;
}
async function enrollment(tx: Tx, ctx: Context, enrollmentId: string, active: boolean) {
  const row = await tx.enrollment.findUnique({ where: { id: enrollmentId }, include: { student: true } });
  if (!row || row.offeringId !== ctx.offering.id) deny();
  if (active && (row.student.status !== "Active" || !row.student.studentId)) conflict("Active student with official ID required");
  return row;
}
async function assignment(tx: Tx, ctx: Context, enrollmentId: string): Promise<Assignment | undefined> {
  const { courseSpecId, assessmentItemId } = ctx.scope;
  const rows = await tx.$queryRaw<Assignment[]>`SELECT id,revision,"variantId","variantHash" FROM exam_variant."ExamPaperAssignment"
    WHERE "enrollmentId"=${enrollmentId} AND "offeringId"=${ctx.offering.id} AND "courseSpecId"=${courseSpecId}
      AND "assessmentItemId"=${assessmentItemId} FOR UPDATE`;
  return rows[0];
}

/** Inactive service factory. Dedicated secret injected by trusted server composition;
 * no environment defaults, singleton, router, feature flag, grade writes or deployment.
 * Signed proposals authenticate the preparer and reviewed mapping, not external evidence.
 */
export function createExamVariantManagementService(db: PrismaClient, proposalSecret: Uint8Array) {
  if (proposalSecret.byteLength < 32) throw new Error("Dedicated exam proposal signing key required");
  const key = Buffer.from(proposalSecret);
  const mac = (body: string) => createHmac("sha256", key).update(body).digest();
  function sign(payload: z.infer<typeof proposalSchema>) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return body + "." + mac(body).toString("base64url");
  }
  function open(token: string) {
    const parts = token.split(".");
    const body = parts[0];
    const signature = parts[1];
    if (parts.length !== 2 || !body || !signature || !/^[A-Za-z0-9_-]+$/.test(body) ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature)) deny();
    const bytes = Buffer.from(signature, "base64url");
    const expected = mac(body);
    if (bytes.length !== expected.length || !timingSafeEqual(bytes, expected)) deny();
    const payload = proposalSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (payload.expiresAt <= Date.now()) conflict("Moderation proposal expired");
    return { ...payload, snapshot: verifyExamVariantSnapshot(payload.snapshot) };
  }
  const transact = <T>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn, { isolationLevel: "Serializable", timeout: 30000 });
  return {
    prepare(actor: AuthUser, input: unknown) {
      const request = prepareSchema.parse(input);
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, request, "teacher");
        writable(ctx);
        const row = await scheme(tx, request.instrumentId, true);
        if (row.ownerId !== ctx.user.id) deny();
        const cfg = await config(tx, ctx);
        if (cfg && cfg.examMaximum !== request.examMaximum) conflict("Exam maximum cannot change");
        const mapping = new Map(request.mappings.map((m) => [m.questionId, m]));
        if (mapping.size !== row.criterionRows.length || mapping.size !== request.mappings.length) conflict("One mapping per question required");
        const questions = row.criterionRows.map((q) => {
          const m = mapping.get(q.id);
          if (!m || q.maxPoints === null) conflict("Question mapping missing");
          return { ...m, maxPoints: q.maxPoints };
        });
        const snapshot = createExamVariantSnapshot({ ...ctx.scope, variantId: request.variantId, revision: request.revision,
          instrumentId: row.id, instrumentHash: rubricContentHash(row), examMaximum: request.examMaximum, questions });
        validateQuestions(ctx, row, snapshot);
        const expiresAt = Date.now() + 30 * 60 * 1000;
        return { snapshot, expiresAt, token: sign({ purpose: "exam-variant-proposal-v1",
          offeringId: ctx.offering.id, preparerId: ctx.user.id, expiresAt, snapshot }) };
      });
    },
    approve(actor: AuthUser, input: unknown) {
      const request = approvalSchema.parse(input);
      const proposal = open(request.token);
      if (proposal.snapshot.variantHash !== request.expectedHash) conflict("Reviewed paper hash mismatch");
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, { offeringId: proposal.offeringId, assessmentItemId: proposal.snapshot.assessmentItemId }, "reviewer");
        writable(ctx);
        if (ctx.user.id === proposal.preparerId) deny();
        const teacher = await context(tx, proposal.preparerId, { offeringId: proposal.offeringId, assessmentItemId: proposal.snapshot.assessmentItemId }, "teacher");
        const s = proposal.snapshot;
        if (s.programmeId !== ctx.scope.programmeId || s.courseSpecId !== ctx.scope.courseSpecId) conflict("Reviewed scope changed");
        const row = await scheme(tx, s.instrumentId, true);
        if (row.ownerId !== teacher.user.id) deny();
        validateQuestions(ctx, row, s);
        const { courseSpecId, assessmentItemId, programmeId } = ctx.scope;
        const cfg = await config(tx, ctx);
        if (cfg && cfg.examMaximum !== s.examMaximum) conflict("Exam maximum cannot change");
        if (!cfg) await tx.$executeRaw`INSERT INTO exam_variant."ExamConfiguration"
          ("courseSpecId","assessmentItemId","courseId","programmeId","examMaximum","createdById")
          VALUES (${courseSpecId},${assessmentItemId},${ctx.offering.courseId},${programmeId},${s.examMaximum},${ctx.user.id})`;
        const versions = await tx.$queryRaw<Array<{ revision: number }>>`SELECT revision FROM exam_variant."ExamPaperVersion"
          WHERE "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId} AND "variantId"=${s.variantId} ORDER BY revision DESC LIMIT 1`;
        if (s.revision !== (versions[0]?.revision ?? 0) + 1) conflict("Stale or replayed paper revision");
        await tx.$executeRaw`INSERT INTO exam_variant."ExamPaperVersion"
          ("courseSpecId","assessmentItemId","variantId",revision,"variantHash","instrumentId","instrumentHash",questions,"preparedById","approvedById","moderationRef")
          VALUES (${courseSpecId},${assessmentItemId},${s.variantId},${s.revision},${s.variantHash},${s.instrumentId},${s.instrumentHash},
            ${JSON.stringify(s.questions)}::jsonb,${teacher.user.id},${ctx.user.id},${request.moderationRef})`;
        await permit(tx, ctx, s);
        return s;
      });
    },
    permitOffering(actor: AuthUser, input: unknown) {
      const request = versionSchema.parse(input);
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, request, "reviewer");
        writable(ctx);
        const snapshot = await paper(tx, ctx, request, true);
        await permit(tx, ctx, snapshot);
        return snapshot;
      });
    },
    assign(actor: AuthUser, input: unknown) {
      const request = assignSchema.parse(input);
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, request, "teacher");
        if (ctx.offering.status !== "Active") conflict("Active offering required");
        await enrollment(tx, ctx, request.enrollmentId, true);
        const snapshot = await paper(tx, ctx, request, true);
        if (!(await permission(tx, ctx, snapshot))) deny();
        const existing = await assignment(tx, ctx, request.enrollmentId);
        if ((existing?.revision ?? 0) !== request.expectedRevision) conflict("Stale assignment revision");
        const { courseSpecId, assessmentItemId } = ctx.scope;
        if (await tx.assessmentResult.findFirst({ where: { enrollmentId: request.enrollmentId, courseSpecId, assessmentItemId }, select: { id: true } })) conflict("Existing result blocks assignment or reassignment");
        if (existing) {
          if (existing.variantId === snapshot.variantId && existing.variantHash === snapshot.variantHash) conflict("Assignment is unchanged");
          const changed = await tx.$executeRaw`UPDATE exam_variant."ExamPaperAssignment" SET revision=${existing.revision + 1},
            "variantId"=${snapshot.variantId},"variantHash"=${snapshot.variantHash},"actorId"=${ctx.user.id},reason=${request.reason},"evidenceRef"=${request.evidenceRef}
            WHERE id=${existing.id} AND revision=${existing.revision}`;
          if (changed !== 1) conflict("Stale assignment revision");
          return { id: existing.id, revision: existing.revision + 1, variantId: snapshot.variantId, variantHash: snapshot.variantHash };
        }
        const assignmentId = randomUUID();
        await tx.$executeRaw`INSERT INTO exam_variant."ExamPaperAssignment"
          (id,"enrollmentId","offeringId","courseSpecId","assessmentItemId","variantId","variantHash","actorId",reason,"evidenceRef")
          VALUES (${assignmentId},${request.enrollmentId},${ctx.offering.id},${courseSpecId},${assessmentItemId},${snapshot.variantId},${snapshot.variantHash},${ctx.user.id},${request.reason},${request.evidenceRef})`;
        return { id: assignmentId, revision: 1, variantId: snapshot.variantId, variantHash: snapshot.variantHash };
      });
    },
    resolve(actor: AuthUser, input: unknown) {
      const request = resolveSchema.parse(input);
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, request, "read");
        await enrollment(tx, ctx, request.enrollmentId, false);
        const current = await assignment(tx, ctx, request.enrollmentId);
        if (!current) conflict("Confirmed assignment unavailable");
        const snapshot = await paper(tx, ctx, current, false);
        if (!(await permission(tx, ctx, snapshot))) deny();
        const v = { variantId: current.variantId, variantHash: current.variantHash };
        const offeringScope = { ...ctx.scope, offeringId: ctx.offering.id };
        const enrollmentScope = { ...offeringScope, enrollmentId: request.enrollmentId };
        return { assignment: current, snapshot: resolveExamVariant({
          context: { ...enrollmentScope, examMaximum: snapshot.examMaximum, activeCloCodes: ctx.activeCloCodes },
          variants: [snapshot], permissions: [{ ...offeringScope, ...v }],
          assignment: { ...enrollmentScope, ...v, confirmed: true },
        }) };
      });
    },
  };
}
