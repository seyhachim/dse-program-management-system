import express, { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser } from "../../../core/auth/token.ts";
import { roleHasPermission } from "../../../core/permissions/index.ts";
import { prisma } from "../../../core/db/prisma.ts";
import { EvidenceStorageError, MAX_EVIDENCE_BYTES, parseEvidenceAttachment, publicAttachment, validateEvidenceFile, storeEvidenceFile, removeUnlinkedEvidence, signEvidenceDownload, type EvidenceAttachment } from "./assessment-evidence-storage.ts";
import { suggestAssessmentSamples } from "./assessment-sampling.ts";
import { evidenceAccess, evidenceSourceHash, isSupportedWorkReference, transitionEvidence } from "./assessment-evidence-policy.ts";

type Db = Prisma.TransactionClient;
class EvidenceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const ContextSchema = z.object({
  offeringId: z.string().uuid(),
  courseSpecId: z.string().uuid(),
  // CourseSpec item IDs can be imported or legacy (e.g. seed-assessment-1).
  assessmentItemId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});
type Context = z.infer<typeof ContextSchema>;
const ResultId = z.string().uuid();
type Population = "individual" | "group" | "component";
function populationFor(req: Request): Population {
  const p = req.params.population ?? "individual";
  if (p !== "individual" && p !== "group" && p !== "component") throw new EvidenceError(400, "Invalid assessment evidence population");
  return p;
}
function populationAllowed(mode: string, p: Population) {
  return mode === "Individual" ? p === "individual" : mode === "Group" ? p === "group" : mode === "GroupIndividual" && (p === "group" || p === "component");
}
function populationFilter(p: Population) {
  return p === "individual" ? { resultId: { not: null } } : p === "group" ? { groupScoreId: { not: null } } : { componentId: { not: null } };
}
function sourceIdentity(p: Population, id: string) {
  return p === "individual" ? { resultId: id } : p === "group" ? { groupScoreId: id } : { componentId: id };
}
function revisionSourceId(row: { resultId: string | null; groupScoreId: string | null; componentId: string | null }) {
  return row.resultId ?? row.groupScoreId ?? row.componentId ?? "";
}
const Reference = z.string().trim().max(1000).refine(isSupportedWorkReference).nullable();
const Reason = z.string().trim().min(1).max(500);
const Mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), expectedRevision: z.literal(0), selectionReason: Reason, workReference: Reference }).strict(),
  z.object({ action: z.literal("revise"), expectedRevision: z.number().int().positive(), selectionReason: Reason, workReference: Reference, keepAttachment: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("submit"), expectedRevision: z.number().int().positive(), confirmedMarkedWork: z.literal(true) }).strict(),
  z.object({ action: z.literal("verify"), expectedRevision: z.number().int().positive(), reviewReason: Reason, confirmedRestrictedWorkAndMarks: z.literal(true) }).strict(),
  z.object({ action: z.literal("request_changes"), expectedRevision: z.number().int().positive(), reviewReason: Reason }).strict(),
]);

async function contextFor(db: Db, user: AuthUser, context: Context, population: Population = "individual") {
  const offering = await db.offering.findUnique({
    where: { id: context.offeringId },
    select: { id: true, courseId: true, courseSpecId: true, lecturerId: true,
      coLecturers: { select: { lecturerId: true } },
      course: { select: { programmeId: true } },
      courseSpec: { select: { id: true, courseId: true, reviewStatus: true } } },
  });
  if (!offering) throw new EvidenceError(404, "Assessment context not found");
  const lecturers = [...offering.coLecturers.map(x => x.lecturerId), ...(offering.lecturerId ? [offering.lecturerId] : [])];
  const scope = evidenceAccess(user, offering.course.programmeId, lecturers);
  const access = {
    contribute: scope.contribute && await roleHasPermission(user.roles, "courses:write"),
    review: scope.review && await roleHasPermission(user.roles, "qa:manage"),
  };
  if (!access.contribute && !access.review) throw new EvidenceError(404, "Assessment context not found");
  if (offering.courseSpecId !== context.courseSpecId || offering.courseSpec?.courseId !== offering.courseId ||
      offering.courseSpec?.reviewStatus !== "Approved") {
    throw new EvidenceError(409, "Offering must use the exact approved course specification");
  }
  const item = await db.courseSpecAssessmentItem.findUnique({
    where: { courseSpecId_id: { courseSpecId: context.courseSpecId, id: context.assessmentItemId } },
    select: { id: true, status: true, mode: true, rubricId: true },
  });
  if (!item || item.status !== "Active") throw new EvidenceError(404, "Assessment context not found");
  if (!populationAllowed(item.mode, population)) throw new EvidenceError(409, "Evidence population does not match assessment mode");
  return { access, item };
}

const resultSelect = {
  id: true, enrollmentId: true, score: true, maxScore: true, feedback: true, updatedAt: true,
  publishedAt: true, finalizedAt: true,
  criterionScores: { orderBy: { id: "asc" as const }, select: {
    id: true, rubricId: true, rubricContentHash: true, criterionId: true, score: true, maxScore: true,
  } },
  corrections: { orderBy: { id: "asc" as const }, select: { id: true } },
} satisfies Prisma.AssessmentResultSelect;
type Source = Prisma.AssessmentResultGetPayload<{ select: typeof resultSelect }> & { groupContext?: { groupId: string; memberEnrollmentIds: string[]; rawScore: number; adjustmentPoints: number; adjustmentReason: string; groupName: string; lockedAt: string }; label?: string };
function sourceWhere(context: Context) {
  return { courseSpecId: context.courseSpecId, assessmentItemId: context.assessmentItemId,
    enrollment: { offeringId: context.offeringId } };
}
async function sourcesFor(db: Db, context: Context, population: Population, id?: string): Promise<Source[]> {
  if (population === "individual") return db.assessmentResult.findMany({
    where: { ...sourceWhere(context), ...(id ? { id } : {}) }, select: resultSelect, orderBy: { id: "asc" }, take: 501,
  });
  const criteria = resultSelect.criterionScores;
  const corrections = resultSelect.corrections;
  const groups = await db.assessmentGroup.findMany({
    where: { ...context, membershipLockedAt: { not: null }, publishedAt: { not: null }, finalizedAt: { not: null },
      ...(id ? population === "group" ? { score: { is: { id } } } : { individualComponents: { some: { id } } } : {}) },
    orderBy: { id: "asc" }, take: 501,
    select: { id: true, name: true, membershipLockedAt: true, publishedAt: true, finalizedAt: true,
      members: { orderBy: { enrollmentId: "asc" }, select: { enrollmentId: true, enrollment: { select: { offeringId: true } } } },
      score: { select: { id: true, score: true, maxScore: true, feedback: true, updatedAt: true, criterionScores: criteria, corrections } },
      individualComponents: { where: id && population === "component" ? { id } : {}, orderBy: { id: "asc" },
        select: { id: true, enrollmentId: true, score: true, maxScore: true, feedback: true, updatedAt: true,
          adjustmentPoints: true, adjustmentReason: true, criterionScores: criteria, corrections, enrollment: { select: { offeringId: true } } } },
    },
  });
  if (groups.length > 500) throw new EvidenceError(409, "Assessment exceeds the pilot cohort limit");
  const out: Source[] = [];
  for (const g of groups) {
    if (!g.score || !g.members.length || g.members.some(m => m.enrollment.offeringId !== context.offeringId)) continue;
    const memberEnrollmentIds = g.members.map(m => m.enrollmentId);
    const shared = { publishedAt: g.publishedAt, finalizedAt: g.finalizedAt };
    const groupContext = { groupId: g.id, memberEnrollmentIds, groupName: g.name, lockedAt: g.membershipLockedAt!.toISOString() };
    if (population === "group" && (!id || g.score.id === id)) {
      out.push({ ...g.score, ...shared, enrollmentId: "", label: g.name,
        groupContext: { ...groupContext, rawScore: g.score.score, adjustmentPoints: 0, adjustmentReason: "" } });
    }
    if (population === "component") for (const x of g.individualComponents) {
      if (x.enrollment.offeringId !== context.offeringId || !memberEnrollmentIds.includes(x.enrollmentId)) continue;
      out.push({ id: x.id, enrollmentId: x.enrollmentId, score: x.score + x.adjustmentPoints, maxScore: x.maxScore,
        feedback: x.feedback, updatedAt: x.updatedAt, criterionScores: x.criterionScores, corrections: x.corrections, ...shared,
        groupContext: { ...groupContext, rawScore: x.score, adjustmentPoints: x.adjustmentPoints, adjustmentReason: x.adjustmentReason } });
    }
  }
  return out;
}
async function sourceFor(db: Db, context: Context, population: Population, id: string) {
  return (await sourcesFor(db, context, population, id))[0] ?? null;
}
function eligible(source: Source) {
  return !!source.publishedAt && !!source.finalizedAt && Number.isFinite(source.score) &&
    Number.isFinite(source.maxScore) && source.maxScore > 0 && source.score >= 0 && source.score <= source.maxScore;
}
function provenance(source: Source, rubricId: string | null) {
  const snapshot = {
    resultId: source.id, enrollmentId: source.enrollmentId,
    score: source.score, maxScore: source.maxScore,
    publishedAt: source.publishedAt?.toISOString() ?? null,
    finalizedAt: source.finalizedAt?.toISOString() ?? null,
    updatedAt: source.updatedAt.toISOString(), rubricId,
    criterionScores: source.criterionScores,
    correctionIds: source.corrections.map(x => x.id),
    feedbackAvailable: source.feedback.trim().length > 0,
    ...(source.groupContext ? { groupContext: source.groupContext } : {}),
  };
  // Feedback stays in the authoritative result; its changes still invalidate verification.
  return { snapshot, hash: evidenceSourceHash({ ...snapshot, feedback: source.feedback }) };
}
function parseContext(req: Request): Context {
  const parsed = ContextSchema.safeParse({
    offeringId: req.params.offeringId, courseSpecId: req.params.courseSpecId, assessmentItemId: req.params.assessmentItemId,
  });
  if (!parsed.success) throw new EvidenceError(400, "Invalid assessment context");
  return parsed.data;
}
function parseResult(req: Request): string {
  const parsed = ResultId.safeParse(req.params.resultId);
  if (!parsed.success) throw new EvidenceError(400, "Invalid result identifier");
  return parsed.data;
}
function sendError(res: Response, error: unknown) {
  if (error instanceof EvidenceError || error instanceof EvidenceStorageError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
    res.status(409).json({ error: "Evidence or source changed; reload before retrying" }); return;
  }
  // Never log source snapshots, work references, student data or database exception text.
  res.status(500).json({ error: "Assessment evidence operation failed" });
}

function viewRevision<T extends { attachment: unknown; resultId: string | null; groupScoreId: string | null; componentId: string | null }>(row: T) {
  return { ...row, resultId: revisionSourceId(row), attachment: publicAttachment(row.attachment) };
}

const base = "/assessment-evidence/offerings/:offeringId/specs/:courseSpecId/assessments/:assessmentItemId";
export function createAssessmentEvidenceRouter(): Router {
  const router = Router();
  router.use("/assessment-evidence", requireAuth);
  router.use("/assessment-evidence", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });

  router.get("/assessment-evidence/offerings/:offeringId/context", async (req, res) => {
    try {
      const id = z.string().uuid().safeParse(req.params.offeringId);
      if (!id.success) throw new EvidenceError(400, "Invalid offering");
      const offering = await prisma.offering.findUnique({ where: { id: id.data }, select: {
        courseId: true, lecturerId: true, coLecturers: { select: { lecturerId: true } },
        course: { select: { programmeId: true } },
        courseSpec: { select: { id: true, courseId: true, reviewStatus: true, assessmentItems: {
          where: { status: "Active" }, orderBy: { order: "asc" }, select: { id: true, name: true, mode: true },
        } } },
      } });
      if (!offering) throw new EvidenceError(404, "Assessment context not found");
      const user = req.user!;
      const scope = evidenceAccess(user, offering.course.programmeId, [...offering.coLecturers.map(x => x.lecturerId), ...(offering.lecturerId ? [offering.lecturerId] : [])]);
      if (!(scope.contribute && await roleHasPermission(user.roles, "courses:write")) &&
          !(scope.review && await roleHasPermission(user.roles, "qa:manage")))
        throw new EvidenceError(404, "Assessment context not found");
      const spec = offering.courseSpec;
      if (!spec || spec.courseId !== offering.courseId || spec.reviewStatus !== "Approved")
        throw new EvidenceError(409, "Offering must use the exact approved course specification");
      res.json({ courseSpecId: spec.id, assessments: spec.assessmentItems });
    } catch (error) { sendError(res, error); }
  });

  router.get([base, base + "/populations/:population"], async (req, res) => {
    try {
      const context = parseContext(req), population = populationFor(req);
      const response = await prisma.$transaction(async db => {
        const { access, item } = await contextFor(db, req.user!, context, population);
        const sources = await sourcesFor(db, context, population);
        if (sources.length > 500) throw new EvidenceError(409, "Assessment exceeds the pilot cohort limit");
        const latest = await db.assessmentEvidenceRevision.findMany({
          where: { ...context, ...populationFilter(population) }, distinct: ["resultId", "groupScoreId", "componentId"], orderBy: [{ revision: "desc" }],
        });
        const byId = new Map(sources.map(s => [s.id, s]));
        const suggestions = suggestAssessmentSamples(sources.map(s => ({
          sourceId: s.id, score: s.score, maxScore: s.maxScore,
          published: !!s.publishedAt, finalized: !!s.finalizedAt,
          // The existing grade model has no authoritative submission status.
          // A suggestion is never evidence; lecturer must confirm actual work on submit.
          knownNonSubmission: false,
        })));
        return {
          context, population, access, suggestions: { ...suggestions, submissionStatus: "unknown" },
          eligibleResults: sources.filter(eligible).map(s => ({ resultId: s.id, enrollmentId: s.enrollmentId, label: s.label ?? null, memberEnrollmentIds: s.groupContext?.memberEnrollmentIds ?? [], groupName: s.groupContext?.groupName ?? null, score: s.score, maxScore: s.maxScore, feedbackAvailable: !!s.feedback.trim() })),
          evidence: latest.map(row => {
            const source = byId.get(revisionSourceId(row));
            const stale = !source || !eligible(source) || provenance(source, item.rubricId).hash !== row.sourceHash;
            return { ...viewRevision(row), effectiveStatus: stale ? "stale" : row.status };
          }),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      res.json(response);
    } catch (error) { sendError(res, error); }
  });

  router.get([base + "/results/:resultId/history", base + "/populations/:population/results/:resultId/history"], async (req, res) => {
    try {
      const context = parseContext(req), resultId = parseResult(req), population = populationFor(req);
      const cursor = z.coerce.number().int().positive().optional().safeParse(req.query.beforeRevision);
      if (!cursor.success) throw new EvidenceError(400, "Invalid revision cursor");
      const rows = await prisma.$transaction(async db => {
        await contextFor(db, req.user!, context, population);
        const source = await sourceFor(db, context, population, resultId);
        if (!source) throw new EvidenceError(404, "Result not found");
        return db.assessmentEvidenceRevision.findMany({
          where: { ...context, ...sourceIdentity(population, resultId), ...(cursor.data ? { revision: { lt: cursor.data } } : {}) },
          orderBy: { revision: "desc" }, take: 51,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      res.json({ revisions: rows.slice(0, 50).map(viewRevision), nextBeforeRevision: rows.length > 50 ? rows[49]!.revision : null });
    } catch (error) { sendError(res, error); }
  });

  router.post([base + "/results/:resultId/revisions", base + "/populations/:population/results/:resultId/revisions"], async (req, res) => {
    try {
      const context = parseContext(req), resultId = parseResult(req), population = populationFor(req);
      const parsed = Mutation.safeParse(req.body);
      if (!parsed.success) throw new EvidenceError(400, "Invalid evidence revision input");
      const input = parsed.data, user = req.user!;
      const row = await prisma.$transaction(async db => {
        const { access, item } = await contextFor(db, user, context, population);
        const reviewerAction = input.action === "verify" || input.action === "request_changes";
        if (reviewerAction ? !access.review : !access.contribute) throw new EvidenceError(403, "Evidence action not permitted");
        const source = await sourceFor(db, context, population, resultId);
        if (!source) throw new EvidenceError(404, "Result not found");
        if (!eligible(source)) throw new EvidenceError(409, "Evidence requires a valid finalized published result");
        const previous = await db.assessmentEvidenceRevision.findFirst({
          where: { ...context, ...sourceIdentity(population, resultId) }, orderBy: { revision: "desc" },
        });
        if ((previous?.revision ?? 0) !== input.expectedRevision) throw new EvidenceError(409, "Evidence revision changed; reload");
        if (reviewerAction && await db.assessmentEvidenceRevision.findFirst({
          where: { ...sourceIdentity(population, resultId), actorId: user.id, action: { in: ["create", "revise", "submit"] } }, select: { id: true },
        })) throw new EvidenceError(403, "Contributors cannot review their own evidence");

        const contentEdit = input.action === "create" || input.action === "revise";
        const reference = contentEdit ? input.workReference : previous?.workReference ?? null;
        const reason = contentEdit ? input.selectionReason : previous?.selectionReason;
        const attachment = contentEdit && !(input.action === "revise" && input.keepAttachment) ? null : parseEvidenceAttachment(previous?.attachment);
        if (reference && attachment) throw new EvidenceError(400, "Choose either a file or an external reference");
        if (input.action === "revise" && input.keepAttachment && !attachment) throw new EvidenceError(409, "No existing attachment to retain");
        const { snapshot, hash } = provenance(source, item.rubricId);
        const status = transitionEvidence(previous, input.action, hash, access.review, access.contribute, !!reference || !!attachment);
        if (!status || !reason) throw new EvidenceError(409, "Invalid or stale evidence transition; revise and resubmit");
        // Never mutate an official result. The database independently checks
        // canonical context, current score, append-only history and self-review.
        return db.assessmentEvidenceRevision.create({ data: {
          ...context, ...sourceIdentity(population, resultId), revision: input.expectedRevision + 1,
          status, action: input.action, sourceHash: hash, sourceSnapshot: snapshot,
          score: source.score, maxScore: source.maxScore,
          workReference: reference, attachment: attachment ?? Prisma.DbNull, selectionReason: reason,
          reviewReason: "reviewReason" in input ? input.reviewReason : null,
          actorId: user.id,
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      res.status(201).json({ ...viewRevision(row), effectiveStatus: row.status });
    } catch (error) { sendError(res, error); }
  });

  // Authorization and current revision checks precede scanning and any storage write.
  router.post([base + "/results/:resultId/attachment", base + "/populations/:population/results/:resultId/attachment"],
    async (req, res, next) => {
      try {
        const context = parseContext(req), resultId = parseResult(req), population = populationFor(req);
        const header = req.header("x-evidence-revision");
        const revision = header !== undefined && /^\d+$/.test(header) ? Number(header) : -1;
        if (!Number.isSafeInteger(revision) || revision < 0) throw new EvidenceError(400, "Invalid expected revision");
        await prisma.$transaction(async db => {
          const { access } = await contextFor(db, req.user!, context, population);
          if (!access.contribute) throw new EvidenceError(403, "Evidence action not permitted");
          const source = await sourceFor(db, context, population, resultId);
          if (!source || !eligible(source)) throw new EvidenceError(404, "Eligible result not found");
          const previous = await db.assessmentEvidenceRevision.findFirst({ where: { ...context, ...sourceIdentity(population, resultId) }, orderBy: { revision: "desc" } });
          if ((previous?.revision ?? 0) !== revision) throw new EvidenceError(409, "Evidence revision changed; reload");
        });
        next();
      } catch (error) { sendError(res, error); }
    },
    express.raw({ type: "application/octet-stream", limit: MAX_EVIDENCE_BYTES }),
    async (req, res) => {
      let uploaded: EvidenceAttachment | null = null;
      try {
        const context = parseContext(req), resultId = parseResult(req), population = populationFor(req), user = req.user!;
        const revision = Number(req.header("x-evidence-revision"));
        let selectionReason = "";
        try { selectionReason = decodeURIComponent(req.header("x-evidence-reason") ?? ""); } catch { /* invalid */ }
        const reason = Reason.safeParse(selectionReason);
        if (!reason.success) throw new EvidenceError(400, "Selection reason is required");
        const file = validateEvidenceFile(req.header("x-evidence-filename"), req.header("x-evidence-mime"), req.body);
        uploaded = await storeEvidenceFile(file);
        const attachment = uploaded;
        const row = await prisma.$transaction(async db => {
          const { access, item } = await contextFor(db, user, context, population);
          if (!access.contribute) throw new EvidenceError(403, "Evidence action not permitted");
          const source = await sourceFor(db, context, population, resultId);
          if (!source || !eligible(source)) throw new EvidenceError(404, "Eligible result not found");
          const previous = await db.assessmentEvidenceRevision.findFirst({ where: { ...context, ...sourceIdentity(population, resultId) }, orderBy: { revision: "desc" } });
          if ((previous?.revision ?? 0) !== revision) throw new EvidenceError(409, "Evidence revision changed; reload");
          const { snapshot, hash } = provenance(source, item.rubricId);
          return db.assessmentEvidenceRevision.create({ data: {
            ...context, ...sourceIdentity(population, resultId), revision: revision + 1, status: "draft", action: previous ? "revise" : "create",
            sourceHash: hash, sourceSnapshot: snapshot, score: source.score, maxScore: source.maxScore,
            workReference: null, attachment, selectionReason: reason.data, actorId: user.id,
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        res.status(201).json({ ...viewRevision(row), effectiveStatus: row.status });
      } catch (error) {
        // Only remove an object after a known rollback; an ambiguous commit is
        // retained privately for operator reconciliation rather than deleting evidence.
        if (uploaded && (error instanceof EvidenceError || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002","P2003","P2034"].includes(error.code)))) {
          try { await removeUnlinkedEvidence(uploaded); } catch { /* private orphan reconciliation required */ }
        }
        sendError(res, error);
      }
    },
    (error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
      if ((error as { type?: string }).type === "entity.too.large") { res.status(413).json({ error: "Evidence file exceeds 5 MiB" }); return; }
      sendError(res, error);
    },
  );

  router.get([base + "/results/:resultId/revisions/:revision/download", base + "/populations/:population/results/:resultId/revisions/:revision/download"], async (req, res) => {
    try {
      const context = parseContext(req), resultId = parseResult(req), population = populationFor(req);
      const revision = z.coerce.number().int().positive().safeParse(req.params.revision);
      if (!revision.success) throw new EvidenceError(400, "Invalid revision");
      const attachment = await prisma.$transaction(async db => {
        await contextFor(db, req.user!, context, population);
        const row = await db.assessmentEvidenceRevision.findFirst({ where: { ...context, ...sourceIdentity(population, resultId), revision: revision.data } });
        const file = parseEvidenceAttachment(row?.attachment);
        if (!file) throw new EvidenceError(404, "Evidence attachment not found");
        return file;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      res.json(await signEvidenceDownload(attachment));
    } catch (error) { sendError(res, error); }
  });

  return router;
}
