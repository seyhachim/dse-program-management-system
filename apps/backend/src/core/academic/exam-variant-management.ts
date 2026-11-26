import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/token.ts";
import { createExamVariantSnapshot, resolveExamVariant, summarizeExamVariantScores, verifyExamVariantSnapshot } from "./exam-variant.ts";
import { rubricContentHash } from "./rubric-context.ts";
import { academicBlueprintSchema, buildAcademicBlueprint, blueprintDistribution, equivalenceSchema, type AcademicBlueprint } from "./exam-academic-blueprint.ts";

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
const assignmentEntrySchema = z.object({
  variantId: id, variantHash: hash,
  enrollmentId: id, expectedRevision: z.number().int().min(0).max(2147483646),
  reason: z.string().trim().min(5).max(500), evidenceRef: ref,
}).strict();
const assignSchema = scopeSchema.merge(assignmentEntrySchema);
const resolveSchema = scopeSchema.extend({ enrollmentId: id });
const feedbackSchema = z.array(z.object({ questionId: id, comment: z.string().trim().min(1).max(1000) }).strict()).max(1000);
const academicDecisionSchema = z.discriminatedUnion("decision", [
  versionSchema.extend({ dossierId:id, decision:z.literal("Approved"), review:equivalenceSchema }),
  versionSchema.extend({ dossierId:id, decision:z.literal("Returned"), review:z.object({rationale:z.string().trim().min(10).max(2000)}).strict() }),
]);
const gradeSchema = resolveSchema.extend({
  assignmentId: id, assignmentRevision: z.number().int().min(1).max(2147483647),
  variantHash: hash, expectedGradeRevision: z.number().int().min(0).max(2147483646),
  marks: z.array(z.object({ questionId: id, score: z.number().finite().nonnegative().nullable() }).strict()).max(1000),
  feedback: feedbackSchema.optional(),
});
type GradeMark = { questionId: string; maxPoints: number; score: number | null };
type GradeRevision = { dossierId:string|null; feedback:z.infer<typeof feedbackSchema>; revision: number; marks: GradeMark[]; complete: boolean; earnedPoints: number | null; maximumPoints: number; actorId: string; savedAt: Date };

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

type Dossier = { id:string; offeringId:string; variantId:string; variantHash:string; blueprint:AcademicBlueprint;
  baselineId:string|null; submittedById:string; submittedAt:Date; status:"Pending"|"Approved"|"Returned";
  decidedById:string|null; decidedAt:Date|null; review:unknown };
type SampleReview = { gradeRevision:number; reviewerId:string; outcome:"Accepted"|"ChangesRequired"; reason:string; sampleRef:string; reviewedAt:Date };
async function academicRows(tx:Tx,ctx:Context,v:Pick<Version,"variantId"|"variantHash">):Promise<Dossier[]> {
  return tx.$queryRaw<Dossier[]>`SELECT id,"offeringId","variantId","variantHash",blueprint,"baselineId","submittedById","submittedAt",status,"decidedById","decidedAt",review
    FROM exam_variant."ExamAcademicDossier" WHERE "courseSpecId"=${ctx.scope.courseSpecId} AND "assessmentItemId"=${ctx.scope.assessmentItemId}
    AND "variantId"=${v.variantId} AND "variantHash"=${v.variantHash} ORDER BY "submittedAt" DESC,id LIMIT 101`;
}
async function approvedDossier(tx:Tx,ctx:Context,v:Pick<Version,"variantId"|"variantHash">):Promise<Dossier|undefined> {
  const rows=await academicRows(tx,ctx,v);
  if(rows.length>100) conflict("Academic dossier history exceeds pilot limits");
  return rows.find(r=>r.status==="Approved");
}
async function baselineDossier(tx:Tx,ctx:Context):Promise<Dossier|undefined> {
  const rows=await tx.$queryRaw<Dossier[]>`SELECT id,"offeringId","variantId","variantHash",blueprint,"baselineId","submittedById","submittedAt",status,"decidedById","decidedAt",review
    FROM exam_variant."ExamAcademicDossier" WHERE "courseSpecId"=${ctx.scope.courseSpecId} AND "assessmentItemId"=${ctx.scope.assessmentItemId}
    AND status='Approved' AND "baselineId" IS NULL`;
  return rows[0];
}
function dossierResponse(row:Dossier) {
  return {...row,submittedAt:row.submittedAt.toISOString(),decidedAt:row.decidedAt?.toISOString()??null,distribution:blueprintDistribution(row.blueprint)};
}
async function paperAuthor(tx:Tx,ctx:Context,v:Pick<Version,"variantId"|"variantHash">) {
  const rows=await tx.$queryRaw<Array<{preparedById:string}>>`SELECT "preparedById" FROM exam_variant."ExamPaperVersion"
    WHERE "courseSpecId"=${ctx.scope.courseSpecId} AND "assessmentItemId"=${ctx.scope.assessmentItemId} AND "variantId"=${v.variantId} AND "variantHash"=${v.variantHash}`;
  return rows[0]?.preparedById;
}
async function sampleReview(tx:Tx,assignmentId:string,revision:number) {
  const rows=await tx.$queryRaw<SampleReview[]>`SELECT "gradeRevision","reviewerId",outcome,reason,"sampleRef","reviewedAt"
    FROM exam_variant."ExamSampleModeration" WHERE "assignmentId"=${assignmentId} AND "gradeRevision"=${revision}`;
  const row=rows[0];
  return row?{...row,reviewedAt:row.reviewedAt.toISOString()}:null;
}

async function gradeRevision(tx: Tx, assignmentId: string): Promise<GradeRevision | undefined> {
  const rows = await tx.$queryRaw<GradeRevision[]>`SELECT revision,marks,complete,"earnedPoints","maximumPoints","actorId","savedAt","dossierId",feedback
    FROM exam_variant."ExamGradeRevision" WHERE "assignmentId"=${assignmentId} ORDER BY revision DESC LIMIT 1`;
  return rows[0];
}
async function gradeContext(tx: Tx, actorId: string, request: z.infer<typeof resolveSchema>, write: boolean) {
  const ctx = await context(tx, actorId, request, write ? "teacher" : "read");
  if (write && ctx.offering.status !== "Active") conflict("Active offering required for grading");
  const student = await enrollment(tx, ctx, request.enrollmentId, write);
  const current = await assignment(tx, ctx, request.enrollmentId);
  if (!current) conflict("Confirmed assignment unavailable");
  // Archived immutable instruments remain readable and gradeable by exact hash.
  const snapshot = await paper(tx, ctx, current, false);
  if (!(await permission(tx, ctx, snapshot))) deny();
  const scope = { ...ctx.scope, offeringId: ctx.offering.id, enrollmentId: request.enrollmentId };
  const v = { variantId: current.variantId, variantHash: current.variantHash };
  const resolution = {
    context: { ...scope, examMaximum: snapshot.examMaximum, activeCloCodes: ctx.activeCloCodes },
    variants: [snapshot],
    permissions: [{ ...ctx.scope, offeringId: ctx.offering.id, ...v }],
    assignment: { ...scope, ...v, confirmed: true },
  };
  const labels = await tx.rubricCriterion.findMany({ where: { rubricId: snapshot.instrumentId }, select: { id: true, name: true } });
  const questionLabels = Object.fromEntries(labels.map(q=>[q.id,q.name]));
  const dossier = await approvedDossier(tx,ctx,current);
  if(write&&!dossier) conflict("Approved academic marking dossier required");
  return { ctx, current, snapshot: resolveExamVariant(resolution), scope, v, resolution, questionLabels,dossier,
    canEdit: Boolean(dossier) && ctx.teacher && ctx.offering.status === "Active" && student.student.status === "Active" && Boolean(student.student.studentId) };
}
async function gradeResponse(tx:Tx,g: Awaited<ReturnType<typeof gradeContext>>, row: GradeRevision | undefined) {
  const summary = summarizeExamVariantScores(g.resolution, { ...g.scope, ...g.v, marks: row?.marks ?? [] });
  if (row && (row.complete !== summary.complete || row.maximumPoints !== summary.maximumPoints ||
      (row.earnedPoints === null ? summary.earnedPoints !== null :
        summary.earnedPoints === null || Math.abs(row.earnedPoints-summary.earnedPoints)>Math.max(Math.abs(row.earnedPoints),Math.abs(summary.earnedPoints))*1e-12))) {
    conflict("Stored grade integrity mismatch");
  }
  return { assignment: g.current, snapshot: g.snapshot, canEdit: g.canEdit,
    gradeRevision: row?.revision ?? 0, complete: summary.complete, questionLabels: g.questionLabels,
    academicDossierId:g.dossier?.id??null, blueprint:g.dossier?.blueprint??null, feedback:row?.feedback??[],
    canModerate:Boolean(row?.complete&&row.dossierId&&g.ctx.reviewer&&row.actorId!==g.ctx.user.id&&g.ctx.offering.status!=="Completed"),
    sampleModeration:row?await sampleReview(tx,g.current.id,row.revision):null,
    earnedPoints: summary.earnedPoints, maximumPoints: summary.maximumPoints,
    marks: summary.rows.map(q=>({ questionId:q.questionId,maxPoints:q.maxPoints,score:q.score })),
    savedAt: row?.savedAt.toISOString() ?? null };
}

/** Inactive service factory. Dedicated secret injected by trusted server composition;
 * no environment defaults, singleton or deployment. Private draft grades only; no release.
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
  async function transact<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable", timeout: 30000 });
    } catch (error) {
      const e = error as { code?: string; meta?: { code?: string } } | undefined;
      if (e?.code === "P2034" || (e?.code === "P2010" && ["40001", "40P01"].includes(e.meta?.code ?? ""))) {
        conflict("Concurrent academic change; reload before retrying");
      }
      throw error;
    }
  }
  async function prepareSnapshot(tx: Tx, actor: AuthUser, request: z.infer<typeof prepareSchema>) {
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

        return { ctx, snapshot };
  }
  async function approveSnapshot(tx: Tx, actor: AuthUser, proposal: { offeringId: string; preparerId: string; snapshot: Snapshot }, moderationRef: string) {
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
            ${JSON.stringify(s.questions)}::jsonb,${teacher.user.id},${ctx.user.id},${moderationRef})`;
        await permit(tx, ctx, s);
        return s;
  }
  async function assignOne(tx: Tx, actor: AuthUser, request: z.infer<typeof assignSchema>) {
        const ctx = await context(tx, actor.id, request, "teacher");
        if (ctx.offering.status !== "Active") conflict("Active offering required");
        await enrollment(tx, ctx, request.enrollmentId, true);
        const snapshot = await paper(tx, ctx, request, true);
        if (!(await permission(tx, ctx, snapshot))) deny();
        const existing = await assignment(tx, ctx, request.enrollmentId);
        if ((existing?.revision ?? 0) !== request.expectedRevision) conflict("Stale assignment revision");
        const { courseSpecId, assessmentItemId } = ctx.scope;
        if (await tx.assessmentResult.findFirst({ where: { enrollmentId: request.enrollmentId, courseSpecId, assessmentItemId }, select: { id: true } })) conflict("Existing result blocks assignment or reassignment");
        if (existing && await gradeRevision(tx, existing.id)) conflict("Saved question marks lock the paper assignment");
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
  }
  return {
    async academicWorkspace(actor:AuthUser,input:unknown) {
      const request=versionSchema.parse(input);
      return transact(async tx=>{
        const ctx=await context(tx,actor.id,request,"read");
        if(!ctx.reviewer&&!(await permission(tx,ctx,request))) deny();
        const snapshot=await paper(tx,ctx,request,false);
        const rows=await academicRows(tx,ctx,request);
        if(rows.length>100) conflict("Academic dossier history exceeds pilot limits");
        const baseline=await baselineDossier(tx,ctx);
        return {snapshot,dossiers:rows.map(dossierResponse),
          baseline:baseline?{id:baseline.id,variantId:baseline.variantId,variantHash:baseline.variantHash,
            durationMinutes:baseline.blueprint.durationMinutes,conditions:baseline.blueprint.conditions,distribution:blueprintDistribution(baseline.blueprint)}:null,
          canSubmit:ctx.teacher&&ctx.offering.status!=="Completed"&&await permission(tx,ctx,request)&&!rows.some(r=>r.status==="Pending"||r.status==="Approved"),
          canReview:ctx.reviewer&&ctx.offering.status!=="Completed"&&await paperAuthor(tx,ctx,request)!==ctx.user.id,
          questionLabels:Object.fromEntries((await scheme(tx,snapshot.instrumentId,false)).criterionRows.map(q=>[q.id,q.name]))};
      });
    },
    async submitAcademic(actor:AuthUser,input:unknown) {
      const request=versionSchema.extend({baselineId:id.nullable(),blueprint:academicBlueprintSchema}).parse(input);
      return transact(async tx=>{
        const ctx=await context(tx,actor.id,request,"teacher");
        writable(ctx);
        if(!(await permission(tx,ctx,request))) deny();
        const snapshot=await paper(tx,ctx,request,false);
        const baseline=await baselineDossier(tx,ctx);
        if(request.baselineId!==(baseline?.id??null)) conflict("Academic baseline changed; reload before submitting");
        const rows=await academicRows(tx,ctx,request);
        if(rows.length>=100||rows.some(r=>r.status==="Pending"||r.status==="Approved")) conflict("Paper already has an open academic dossier");
        let blueprint:AcademicBlueprint;
        try {blueprint=buildAcademicBlueprint(snapshot,request.blueprint);} catch {conflict("Invalid scored component mapping");}
        const dossierId=randomUUID();
        await tx.$executeRaw`INSERT INTO exam_variant."ExamAcademicDossier"
          (id,"offeringId","courseSpecId","assessmentItemId","variantId","variantHash",blueprint,"baselineId","submittedById")
          VALUES (${dossierId},${ctx.offering.id},${ctx.scope.courseSpecId},${ctx.scope.assessmentItemId},${snapshot.variantId},${snapshot.variantHash},
            ${JSON.stringify(blueprint)}::jsonb,${request.baselineId},${ctx.user.id})`;
        return {id:dossierId,status:"Pending" as const};
      });
    },
    async decideAcademic(actor:AuthUser,input:unknown) {
      const request=academicDecisionSchema.parse(input);
      return transact(async tx=>{
        const ctx=await context(tx,actor.id,request,"reviewer");writable(ctx);
        await paper(tx,ctx,request,false);
        const row=(await academicRows(tx,ctx,request)).find(d=>d.id===request.dossierId);
        if(!row||row.submittedById===ctx.user.id||await paperAuthor(tx,ctx,request)===ctx.user.id) deny();
        if(row.status!=="Pending") conflict("Academic dossier has already been decided");
        if(request.decision==="Approved"&&row.baselineId!==((await baselineDossier(tx,ctx))?.id??null)) conflict("Academic baseline changed; return and resubmit");
        const changed=await tx.$executeRaw`UPDATE exam_variant."ExamAcademicDossier" SET status=${request.decision},"decidedById"=${ctx.user.id},"decidedAt"=clock_timestamp(),review=${JSON.stringify(request.review)}::jsonb WHERE id=${row.id} AND status='Pending'`;
        if(changed!==1) conflict("Academic dossier changed; reload");
        return {id:row.id,status:request.decision};
      });
    },
    async moderateSample(actor:AuthUser,input:unknown) {
      const request=resolveSchema.extend({assignmentId:id,gradeRevision:z.number().int().positive(),outcome:z.enum(["Accepted","ChangesRequired"]),
        reason:z.string().trim().min(10).max(2000),sampleRef:ref}).parse(input);
      return transact(async tx=>{
        const g=await gradeContext(tx,actor.id,request,false);
        if(!g.ctx.reviewer) deny();
        writable(g.ctx);
        const row=await gradeRevision(tx,g.current.id);
        if(!row||!row.complete||!row.dossierId||row.revision!==request.gradeRevision||g.current.id!==request.assignmentId) conflict("Current complete academically moderated draft required");
        if(row.actorId===g.ctx.user.id) deny();
        if(await sampleReview(tx,g.current.id,row.revision)) conflict("This grade revision has already been sampled");
        await tx.$executeRaw`INSERT INTO exam_variant."ExamSampleModeration" ("assignmentId","gradeRevision","reviewerId",outcome,reason,"sampleRef")
          VALUES (${g.current.id},${row.revision},${g.ctx.user.id},${request.outcome},${request.reason},${request.sampleRef})`;
        return gradeResponse(tx,g,row);
      });
    },
    async gradeWorkspace(actor: AuthUser, input: unknown) {
      const request = resolveSchema.parse(input);
      return transact(async tx => {
        const g = await gradeContext(tx, actor.id, request, false);
        return gradeResponse(tx,g, await gradeRevision(tx, g.current.id));
      });
    },
    async saveGradeDraft(actor: AuthUser, input: unknown) {
      const request = gradeSchema.parse(input);
      return transact(async tx => {
        const g = await gradeContext(tx, actor.id, request, true);
        if (request.assignmentId !== g.current.id || request.assignmentRevision !== g.current.revision ||
            request.variantHash !== g.current.variantHash) conflict("Paper assignment changed; reload the markbook");
        const previous = await gradeRevision(tx, g.current.id);
        if ((previous?.revision ?? 0) !== request.expectedGradeRevision) conflict("Grade changed; reload the markbook");
        const maxima = new Map(g.snapshot.questions.map(q => [q.questionId,q.maxPoints]));
        const submitted = request.marks.map(m => {
          const maxPoints = maxima.get(m.questionId);
          if (maxPoints === undefined) conflict("Unknown question for assigned paper");
          return { ...m, maxPoints };
        });
        // Require a full replacement, including explicit nulls. Omission must not silently erase saved marks.
        if (submitted.length !== maxima.size || new Set(submitted.map(m=>m.questionId)).size !== maxima.size) conflict("Include each assigned question exactly once");
        if (submitted.some(m=>m.score!==null && m.score>m.maxPoints)) conflict("Question score exceeds maximum");
        const summary = summarizeExamVariantScores(g.resolution,{ ...g.scope,...g.v,marks:submitted });
        const marks = summary.rows.map(q=>({questionId:q.questionId,maxPoints:q.maxPoints,score:q.score}));
        const suppliedFeedback=request.feedback??previous?.feedback??[];
        const comments=new Map(suppliedFeedback.map(f=>[f.questionId,f.comment]));
        if(comments.size!==suppliedFeedback.length||[...comments.keys()].some(q=>!maxima.has(q))) conflict("Invalid question feedback");
        const feedback=marks.flatMap(q=>comments.has(q.questionId)?[{questionId:q.questionId,comment:comments.get(q.questionId)!}]:[]);
        if(!g.dossier) conflict("Approved academic marking dossier required");
        if (previous && previous.dossierId===g.dossier.id &&
          JSON.stringify(previous.marks.map(q=>[q.questionId,q.maxPoints,q.score]))===JSON.stringify(marks.map(q=>[q.questionId,q.maxPoints,q.score])) &&
          JSON.stringify(previous.feedback.map(q=>[q.questionId,q.comment]))===JSON.stringify(feedback.map(q=>[q.questionId,q.comment]))) return gradeResponse(tx,g,previous);
        const revision = request.expectedGradeRevision+1;
        await tx.$executeRaw`INSERT INTO exam_variant."ExamGradeRevision"
          ("assignmentId","assignmentRevision","variantId","variantHash",revision,marks,complete,"earnedPoints","maximumPoints","actorId","dossierId",feedback)
          VALUES (${g.current.id},${g.current.revision},${g.current.variantId},${g.current.variantHash},${revision},
            ${JSON.stringify(marks)}::jsonb,${summary.complete},${summary.earnedPoints},${summary.maximumPoints},${g.ctx.user.id},${g.dossier.id},${JSON.stringify(feedback)}::jsonb)`;
        const saved = await gradeRevision(tx,g.current.id);
        if (!saved || saved.revision!==revision) conflict("Grade save could not be confirmed");
        return gradeResponse(tx,g,saved);
      });
    },
    async submit(actor: AuthUser, input: unknown) {
      const request = prepareSchema.extend({ expectedHash: hash }).parse(input);
      return transact(async (tx) => {
        const { ctx, snapshot } = await prepareSnapshot(tx, actor, request);
        if (request.expectedHash !== snapshot.variantHash) conflict("Preview changed; verify again before submission");
        const { courseSpecId, assessmentItemId, programmeId } = ctx.scope;
        const latest = await tx.$queryRaw<Array<{ revision: number }>>`SELECT revision FROM exam_variant."ExamPaperVersion"
          WHERE "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId} AND "variantId"=${snapshot.variantId} ORDER BY revision DESC LIMIT 1`;
        if (snapshot.revision !== (latest[0]?.revision ?? 0) + 1) conflict("Stale paper revision");
        const pending = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM exam_variant."ExamModerationSubmission"
          WHERE "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId} AND "variantId"=${snapshot.variantId}
          AND revision=${snapshot.revision} AND status='Pending'`;
        if (pending.length) conflict("Paper revision already pending moderation");
        const submissionId = randomUUID();
        await tx.$executeRaw`INSERT INTO exam_variant."ExamModerationSubmission"
          (id,"offeringId","courseId","programmeId","courseSpecId","assessmentItemId","variantId",revision,"variantHash","instrumentId",snapshot,"submittedById")
          VALUES (${submissionId},${ctx.offering.id},${ctx.offering.courseId},${programmeId},${courseSpecId},${assessmentItemId},${snapshot.variantId},
          ${snapshot.revision},${snapshot.variantHash},${snapshot.instrumentId},${JSON.stringify(snapshot)}::jsonb,${ctx.user.id})`;
        return { id: submissionId, snapshot };
      });
    },
    async decide(actor: AuthUser, input: unknown) {
      const request = scopeSchema.extend({ submissionId: id, expectedHash: hash, decision: z.enum(["Approved","Returned"]),
        decisionRef: z.string().trim().min(1).max(500) }).parse(input);
      if (request.decision === "Approved" && !ref.safeParse(request.decisionRef).success) conflict("Opaque moderation reference required");
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, request, "reviewer");
        writable(ctx);
        const { courseSpecId, assessmentItemId, programmeId } = ctx.scope;
        const rows = await tx.$queryRaw<Array<{ id: string; submittedById: string; status: string; variantHash: string; snapshot: unknown }>>`
          SELECT id,"submittedById",status,"variantHash",snapshot FROM exam_variant."ExamModerationSubmission"
          WHERE id=${request.submissionId} AND "offeringId"=${ctx.offering.id} AND "courseSpecId"=${courseSpecId}
          AND "assessmentItemId"=${assessmentItemId} AND "programmeId"=${programmeId} FOR UPDATE`;
        const row = rows[0];
        if (!row || row.submittedById === ctx.user.id) deny();
        if (row.status !== "Pending" || row.variantHash !== request.expectedHash) conflict("Stale moderation decision");
        const snapshot = verifyExamVariantSnapshot(row.snapshot);
        if (snapshot.variantHash !== row.variantHash || snapshot.courseSpecId !== courseSpecId ||
          snapshot.assessmentItemId !== assessmentItemId || snapshot.programmeId !== programmeId) conflict("Moderation snapshot scope mismatch");
        if (request.decision === "Approved") await approveSnapshot(tx, actor,
          { offeringId: ctx.offering.id, preparerId: row.submittedById, snapshot }, request.decisionRef);
        const changed = await tx.$executeRaw`UPDATE exam_variant."ExamModerationSubmission"
          SET status=${request.decision},"decidedById"=${ctx.user.id},"decidedAt"=clock_timestamp(),"decisionRef"=${request.decisionRef}
          WHERE id=${row.id} AND status='Pending'`;
        if (changed !== 1) conflict("Stale moderation decision");
        return { id: row.id, status: request.decision };
      });
    },
    async assignBulk(actor: AuthUser, input: unknown) {
      const request = scopeSchema.extend({ entries: z.array(assignmentEntrySchema).min(1).max(50) }).parse(input);
      if (new Set(request.entries.map((e) => e.enrollmentId)).size !== request.entries.length) conflict("Duplicate enrollment in batch");
      return transact(async (tx) => {
        const results = [];
        for (const entry of [...request.entries].sort((a,b) => a.enrollmentId.localeCompare(b.enrollmentId))) {
          results.push(await assignOne(tx, actor, { offeringId: request.offeringId, assessmentItemId: request.assessmentItemId, ...entry }));
        }
        return results;
      });
    },
    async workspace(actor: AuthUser, input: unknown) {
      const request = scopeSchema.parse(input);
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, request, "read");
        const { courseSpecId, assessmentItemId } = ctx.scope;
        const offeringId = ctx.offering.id;
        const cfg = await config(tx, ctx);
        const rawPapers = await tx.$queryRaw<Array<{ variantId: string; variantHash: string; revision: number; permitted: boolean }>>`
          SELECT p."variantId",p."variantHash",p.revision, EXISTS(SELECT 1 FROM exam_variant."ExamOfferingPermission" g
            WHERE g."offeringId"=${offeringId} AND g."courseSpecId"=p."courseSpecId" AND g."assessmentItemId"=p."assessmentItemId"
            AND g."variantId"=p."variantId" AND g."variantHash"=p."variantHash") AS permitted
          FROM exam_variant."ExamPaperVersion" p WHERE p."courseSpecId"=${courseSpecId} AND p."assessmentItemId"=${assessmentItemId}
          AND (${ctx.reviewer} OR EXISTS(SELECT 1 FROM exam_variant."ExamOfferingPermission" g WHERE g."offeringId"=${offeringId}
            AND g."courseSpecId"=p."courseSpecId" AND g."assessmentItemId"=p."assessmentItemId" AND g."variantId"=p."variantId" AND g."variantHash"=p."variantHash"))
          ORDER BY p."variantId",p.revision LIMIT 201`;
        const rawSubmissions = await tx.$queryRaw<Array<{ id: string; submittedById: string; submittedAt: Date; status: "Pending"|"Approved"|"Returned"; decidedById: string|null; decidedAt: Date|null; decisionRef: string|null; snapshot: unknown }>>`
          SELECT id,"submittedById","submittedAt",status,"decidedById","decidedAt","decisionRef",snapshot FROM exam_variant."ExamModerationSubmission"
          WHERE "offeringId"=${offeringId} AND "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId}
          AND (${ctx.reviewer} OR "submittedById"=${ctx.user.id}) ORDER BY "submittedAt" DESC,id LIMIT 201`;
        const roster = await tx.enrollment.findMany({ where: { offeringId }, orderBy: { id: "asc" }, take: 501,
          select: { id: true, student: { select: { name: true, studentId: true, status: true } } } });
        const assignments = await tx.$queryRaw<Array<Assignment & { enrollmentId: string }>>`SELECT id,"enrollmentId",revision,"variantId","variantHash"
          FROM exam_variant."ExamPaperAssignment" WHERE "offeringId"=${offeringId} AND "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId}`;
        const results = await tx.assessmentResult.findMany({ where: { courseSpecId, assessmentItemId, enrollment: { offeringId } }, select: { enrollmentId: true } });
        const gradeRows = await tx.$queryRaw<Array<{ enrollmentId: string; revision: number; complete: boolean }>>`
          SELECT DISTINCT ON (a."enrollmentId") a."enrollmentId",g.revision,g.complete
          FROM exam_variant."ExamPaperAssignment" a JOIN exam_variant."ExamGradeRevision" g ON g."assignmentId"=a.id
          WHERE a."offeringId"=${offeringId} AND a."courseSpecId"=${courseSpecId} AND a."assessmentItemId"=${assessmentItemId}
          ORDER BY a."enrollmentId",g.revision DESC`;
        const grades = new Map(gradeRows.map(g=>[g.enrollmentId,{revision:g.revision,complete:g.complete}]));
        const instruments = ctx.teacher ? await tx.rubric.findMany({ where: { ownerId: ctx.user.id, status: "Active", instrumentKind: "marking_scheme" },
          orderBy: { name: "asc" }, take: 201, select: { id: true, name: true, criterionRows: { orderBy: [{order:"asc"},{id:"asc"}], select: { id: true, maxPoints: true } } } }) : [];
        if (rawPapers.length > 200 || rawSubmissions.length > 200 || roster.length > 500 || instruments.length > 200) conflict("Workspace exceeds pilot limits");
        const papers = rawPapers.map((p) => ({ ...p }));
        const submissions = rawSubmissions.map((p) => ({ ...p, snapshot: verifyExamVariantSnapshot(p.snapshot),
          submittedAt: p.submittedAt.toISOString(), decidedAt: p.decidedAt?.toISOString() ?? null }));
        const byEnrollment = new Map(assignments.map((a) => [a.enrollmentId,a]));
        const withResult = new Set(results.map((r) => r.enrollmentId));
        return { actorId: ctx.user.id, offeringId, assessmentItemId, offeringStatus: ctx.offering.status,
          canPrepare: ctx.teacher && ctx.offering.status !== "Completed", canReview: ctx.reviewer && ctx.offering.status !== "Completed",
          canAssign: ctx.teacher && ctx.offering.status === "Active", activeCloCodes: ctx.activeCloCodes, examMaximum: cfg?.examMaximum ?? null,
          instruments, papers, submissions, roster: roster.map((r) => ({ enrollmentId: r.id, name: r.student.name,
            studentId: r.student.studentId, eligible: r.student.status === "Active" && Boolean(r.student.studentId),
            hasResult: withResult.has(r.id), grade: grades.get(r.id) ?? null, assignment: byEnrollment.get(r.id) ?? null })) };
      });
    },
    async history(actor: AuthUser, input: unknown) {
      const request = resolveSchema.parse(input);
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, request, "read");
        await enrollment(tx, ctx, request.enrollmentId, false);
        const current = await assignment(tx, ctx, request.enrollmentId);
        if (!current) return [];
        const events = await tx.$queryRaw<Array<{ revision: number; previousVariantId: string|null; previousVariantHash: string|null; variantId: string; variantHash: string; actorId: string; reason: string; evidenceRef: string; changedAt: Date }>>`
          SELECT revision,"previousVariantId","previousVariantHash","variantId","variantHash","actorId",reason,"evidenceRef","changedAt"
          FROM exam_variant."ExamAssignmentEvent" WHERE "assignmentId"=${current.id} ORDER BY revision LIMIT 501`;
        if (events.length > 500) conflict("Assignment history exceeds pilot limits");
        return events.map((e) => ({ ...e, changedAt: e.changedAt.toISOString() }));
      });
    },
    async prepare(actor: AuthUser, input: unknown) {
      const request = prepareSchema.parse(input);
      return transact(async (tx) => {
        const { ctx, snapshot } = await prepareSnapshot(tx, actor, request);
        const expiresAt = Date.now() + 30 * 60 * 1000;
        return { snapshot, expiresAt, token: sign({ purpose: "exam-variant-proposal-v1",
          offeringId: ctx.offering.id, preparerId: ctx.user.id, expiresAt, snapshot }) };
      });
    },
    async approve(actor: AuthUser, input: unknown) {
      const request = approvalSchema.parse(input);
      const proposal = open(request.token);
      if (proposal.snapshot.variantHash !== request.expectedHash) conflict("Reviewed paper hash mismatch");
      return transact(async (tx) => {
        return approveSnapshot(tx, actor, proposal, request.moderationRef);
      });
    },
    async permitOffering(actor: AuthUser, input: unknown) {
      const request = versionSchema.parse(input);
      return transact(async (tx) => {
        const ctx = await context(tx, actor.id, request, "reviewer");
        writable(ctx);
        const snapshot = await paper(tx, ctx, request, true);
        await permit(tx, ctx, snapshot);
        return snapshot;
      });
    },
    async assign(actor: AuthUser, input: unknown) {
      const request = assignSchema.parse(input);
      return transact(async (tx) => {
        return assignOne(tx, actor, request);
      });
    },
    async resolve(actor: AuthUser, input: unknown) {
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
