import { createHash } from "node:crypto";
import { z } from "zod";
import { MARKING_SCHEME_HASH_PREFIX } from "./rubric-context.ts";

// Server-side pure domain contracts, not an API or an authorization boundary.
const identifier = z.string().min(1).max(256).refine((s) => s.trim() === s);
const positive = z.number().finite().positive();
const variantHashSchema = z.string().regex(/^exam-variant-v1:[a-f0-9]{64}$/);
const instrumentHashSchema = z.string().refine((s) =>
  s.startsWith(MARKING_SCHEME_HASH_PREFIX) &&
  /^[a-f0-9]{64}$/.test(s.slice(MARKING_SCHEME_HASH_PREFIX.length)));
const scope = z.object({
  programmeId: identifier,
  courseSpecId: identifier,
  assessmentItemId: identifier,
}).strict();
const offeringScope = scope.extend({ offeringId: identifier });
const enrollmentScope = offeringScope.extend({ enrollmentId: identifier });
const variantRef = z.object({ variantId: identifier, variantHash: variantHashSchema }).strict();
const questionSchema = z.object({
  questionId: identifier,
  maxPoints: positive,
  cloCode: identifier,
  evidence: z.enum(["direct", "supporting"]),
}).strict();

export const examVariantDefinitionSchema = scope.extend({
  variantId: identifier,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  instrumentId: identifier,
  instrumentHash: instrumentHashSchema,
  examMaximum: positive,
  questions: z.array(questionSchema).min(1).max(1000),
});
const snapshotSchema = examVariantDefinitionSchema.extend({ variantHash: variantHashSchema });
export const examVariantPermissionSchema = offeringScope.merge(variantRef);
export const examVariantAssignmentSchema = enrollmentScope.merge(variantRef).extend({
  confirmed: z.literal(true),
});
export const examVariantScoreSubmissionSchema = enrollmentScope.merge(variantRef).extend({
  marks: z.array(z.object({
    questionId: identifier,
    maxPoints: positive,
    score: z.number().finite().nonnegative().nullable(),
  }).strict()).max(1000),
});
const examContextSchema = enrollmentScope.extend({
  examMaximum: positive,
  activeCloCodes: z.array(identifier).min(1),
});

type ExamScope = z.infer<typeof scope>;
type OfferingScope = z.infer<typeof offeringScope>;
type EnrollmentScope = z.infer<typeof enrollmentScope>;
type VariantRef = z.infer<typeof variantRef>;
type ExamVariantDefinition = z.infer<typeof examVariantDefinitionSchema>;
export type ExamVariantQuestion = Readonly<z.infer<typeof questionSchema>>;
export type ExamVariantSnapshot = Readonly<Omit<ExamVariantDefinition, "questions"> & {
  questions: readonly ExamVariantQuestion[];
  variantHash: string;
}>;
export type ExamVariantAssignment = z.infer<typeof examVariantAssignmentSchema>;
export type ExamVariantScoreSubmission = z.infer<typeof examVariantScoreSubmissionSchema>;
export type ExamVariantResolutionInput = {
  context: unknown;
  // Must be populated from authorized, assessment-scoped records by future integration.
  variants: readonly unknown[];
  permissions: readonly unknown[];
  assignment: unknown;
};

function sameScope(a: ExamScope, b: ExamScope): boolean {
  return a.programmeId === b.programmeId && a.courseSpecId === b.courseSpecId &&
    a.assessmentItemId === b.assessmentItemId;
}
function sameOffering(a: OfferingScope, b: OfferingScope): boolean {
  return sameScope(a, b) && a.offeringId === b.offeringId;
}
function sameEnrollment(a: EnrollmentScope, b: EnrollmentScope): boolean {
  return sameOffering(a, b) && a.enrollmentId === b.enrollmentId;
}
function sameVariant(a: VariantRef, b: VariantRef): boolean {
  return a.variantId === b.variantId && a.variantHash === b.variantHash;
}
function equalPoints(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9;
}

function validateDefinition(definition: ExamVariantDefinition): void {
  if (new Set(definition.questions.map((q) => q.questionId)).size !== definition.questions.length) {
    throw new Error("Duplicate exam question identity");
  }
  const maximum = definition.questions.reduce((sum, q) => sum + q.maxPoints, 0);
  if (!equalPoints(maximum, definition.examMaximum)) {
    throw new Error("Question maxima must equal the exam maximum");
  }
}

/** Hash the canonical parsed definition, including ordered questions and evidence roles.
 * This is an integrity identifier, not a signature or proof of institutional approval. */
export function createExamVariantSnapshot(input: unknown): ExamVariantSnapshot {
  const definition = examVariantDefinitionSchema.parse(input);
  validateDefinition(definition);
  const variantHash = "exam-variant-v1:" +
    createHash("sha256").update(JSON.stringify(definition)).digest("hex");
  return Object.freeze({
    ...definition,
    questions: Object.freeze(definition.questions.map((q) => Object.freeze({ ...q }))),
    variantHash,
  });
}

export function verifyExamVariantSnapshot(input: unknown): ExamVariantSnapshot {
  const { variantHash, ...definition } = snapshotSchema.parse(input);
  const verified = createExamVariantSnapshot(definition);
  if (verified.variantHash !== variantHash) throw new Error("Exam variant snapshot integrity mismatch");
  return verified;
}

/** Resolve an exact confirmed assignment; never choose a default or latest version.
 * Scope/permissions are asserted here; authentication, role checks, unique assignment
 * persistence and transactional locking belong to the future server integration. */
export function resolveExamVariant(input: ExamVariantResolutionInput): ExamVariantSnapshot {
  const context = examContextSchema.parse(input.context);
  const assignment = examVariantAssignmentSchema.parse(input.assignment);
  if (!sameEnrollment(context, assignment)) throw new Error("Exam assignment scope mismatch");
  if (new Set(context.activeCloCodes).size !== context.activeCloCodes.length) {
    throw new Error("Duplicate active CLO");
  }

  const variants = input.variants.map(verifyExamVariantSnapshot);
  const revisions = new Set<string>();
  for (const variant of variants) {
    if (!sameScope(context, variant)) throw new Error("Exam variant scope mismatch");
    const key = JSON.stringify([variant.variantId, variant.revision]);
    if (revisions.has(key)) throw new Error("Duplicate exam variant revision");
    revisions.add(key);
  }
  const matches = variants.filter((variant) => sameVariant(variant, assignment));
  if (matches.length !== 1) throw new Error("Assigned exam variant version not found");
  const variant = matches[0]!;
  if (!equalPoints(variant.examMaximum, context.examMaximum)) throw new Error("Exam maximum mismatch");
  if (variant.questions.some((q) => !context.activeCloCodes.includes(q.cloCode))) {
    throw new Error("Exam question references an inactive or unknown CLO");
  }
  const permissions = input.permissions.map((value) => examVariantPermissionSchema.parse(value));
  if (permissions.filter((p) => sameOffering(p, context) && sameVariant(p, variant)).length !== 1) {
    throw new Error("Exact exam variant is not uniquely permitted for this offering");
  }
  return variant;
}

export type ExamQuestionScore = Readonly<ExamVariantQuestion & { score: number | null }>;
export type ExamCloEvidence = Readonly<{
  cloCode: string;
  evidence: ExamVariantQuestion["evidence"];
  earnedPoints: number;
  maximumPoints: number;
  percentage: number;
  questionIds: readonly string[];
}>;
export type ExamVariantScoreSummary = Readonly<{
  variantId: string;
  variantHash: string;
  instrumentId: string;
  instrumentHash: string;
  enrollmentId: string;
  offeringId: string;
  courseSpecId: string;
  assessmentItemId: string;
  programmeId: string;
  complete: boolean;
  earnedPoints: number | null;
  maximumPoints: number;
  rows: readonly ExamQuestionScore[];
  cloEvidence: readonly ExamCloEvidence[];
}>;

/** Validate actual marks against exactly one assigned paper. Missing/null is not zero.
 * Never infer question marks from a recorded total. Incomplete exams have neither
 * a derived total nor CLO evidence. No weight or cross-paper denominator enters here. */
export function summarizeExamVariantScores(
  input: ExamVariantResolutionInput,
  submissionInput: unknown,
): ExamVariantScoreSummary {
  const context = examContextSchema.parse(input.context);
  const variant = resolveExamVariant(input);
  const submission = examVariantScoreSubmissionSchema.parse(submissionInput);
  if (!sameEnrollment(context, submission) || !sameVariant(variant, submission)) {
    throw new Error("Exam score scope or version mismatch");
  }
  const questions = new Map(variant.questions.map((q) => [q.questionId, q]));
  const scores = new Map<string, number | null>();
  for (const mark of submission.marks) {
    const q = questions.get(mark.questionId);
    if (!q) throw new Error("Unknown exam question");
    if (scores.has(mark.questionId)) throw new Error("Duplicate exam question score");
    if (mark.maxPoints !== q.maxPoints) throw new Error("Exam question maximum mismatch");
    if (mark.score !== null && mark.score > q.maxPoints) throw new Error("Exam question score exceeds maximum");
    scores.set(mark.questionId, mark.score);
  }
  const rows = Object.freeze(variant.questions.map((q) =>
    Object.freeze({ ...q, score: scores.get(q.questionId) ?? null })));
  const complete = rows.every((q) => q.score !== null);
  const earnedPoints = complete ? rows.reduce((sum, q) => sum + (q.score ?? 0), 0) : null;
  if (earnedPoints !== null && (!Number.isFinite(earnedPoints) ||
      (earnedPoints > variant.examMaximum && !equalPoints(earnedPoints, variant.examMaximum)))) {
    throw new Error("Invalid derived exam total");
  }

  const cloEvidence: ExamCloEvidence[] = [];
  if (complete) {
    for (const cloCode of context.activeCloCodes) {
      for (const evidence of ["direct", "supporting"] as const) {
        const selected = rows.filter((q) => q.cloCode === cloCode && q.evidence === evidence);
        if (!selected.length) continue;
        const earned = selected.reduce((sum, q) => sum + (q.score ?? 0), 0);
        const maximum = selected.reduce((sum, q) => sum + q.maxPoints, 0);
        cloEvidence.push(Object.freeze({
          cloCode, evidence, earnedPoints: earned, maximumPoints: maximum,
          percentage: Math.round((earned / maximum) * 10000) / 100,
          questionIds: Object.freeze(selected.map((q) => q.questionId)),
        }));
      }
    }
  }
  return Object.freeze({
    programmeId: context.programmeId, courseSpecId: context.courseSpecId,
    assessmentItemId: context.assessmentItemId, offeringId: context.offeringId,
    enrollmentId: context.enrollmentId, variantId: variant.variantId,
    variantHash: variant.variantHash, instrumentId: variant.instrumentId,
    instrumentHash: variant.instrumentHash, complete, earnedPoints,
    maximumPoints: variant.examMaximum, rows, cloEvidence: Object.freeze(cloEvidence),
  });
}

/** Optional reconciliation guard for existing authoritative raw totals. No mutation;
 * total-only historical results cannot be promoted to question-level evidence. */
export function assertExamVariantRecordedTotal(
  summary: ExamVariantScoreSummary,
  recorded: unknown,
): void {
  const total = z.object({ score: z.number().finite().nonnegative(), maxScore: positive }).strict().parse(recorded);
  if (!summary.complete || summary.earnedPoints === null ||
      !equalPoints(summary.earnedPoints, total.score) || !equalPoints(summary.maximumPoints, total.maxScore) ||
      total.score > total.maxScore) {
    throw new Error("Recorded exam total does not reconcile with complete question marks");
  }
}
