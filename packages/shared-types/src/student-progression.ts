import { z } from "zod";

export const STUDENT_COHORT_STATUSES = ["Planned", "Active", "Completed", "Archived"] as const;
export const StudentCohortStatusSchema = z.enum(STUDENT_COHORT_STATUSES);

export const STUDENT_PROGRESSION_STATUSES = [
  "Progressed", "Retained", "Withdrawn", "Inactive", "Graduated", "Transferred",
] as const;
export const StudentProgressionStatusSchema = z.enum(STUDENT_PROGRESSION_STATUSES);

export const STUDENT_PROMOTION_DECISIONS = [
  "Progressed", "Retained", "Withdrawn", "Inactive", "Transferred",
] as const;
export const StudentPromotionDecisionSchema = z.enum(STUDENT_PROMOTION_DECISIONS);
export type StudentPromotionDecision = z.infer<typeof StudentPromotionDecisionSchema>;

export const StudentProgrammeYearSchema = z.number().int().min(1).max(4);
export type StudentProgrammeYear = z.infer<typeof StudentProgrammeYearSchema>;

export const STUDENT_COHORT_EXIT_REASONS = ["Withdrawn", "Transferred", "Graduated", "Other"] as const;
export const StudentCohortExitReasonSchema = z.enum(STUDENT_COHORT_EXIT_REASONS);

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const CreateStudentCohortInput = z.object({
  programmeId: z.string().trim().min(1),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  intakeYear: z.number().int().min(1900).max(2200),
  expectedGraduationYear: z.number().int().min(1900).max(2200),
  status: StudentCohortStatusSchema.default("Active"),
}).superRefine((value, ctx) => {
  if (value.expectedGraduationYear < value.intakeYear) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedGraduationYear"], message: "Expected graduation year cannot precede intake year" });
  }
});
export type CreateStudentCohortInput = z.infer<typeof CreateStudentCohortInput>;

export const ListStudentCohortsQuery = z.object({
  programmeId: z.string().trim().min(1),
  status: StudentCohortStatusSchema.optional(),
});
export type ListStudentCohortsQuery = z.infer<typeof ListStudentCohortsQuery>;

export const AddStudentCohortMembershipInput = z.object({
  studentId: z.string().uuid(),
  joinedAt: DateOnlySchema,
  note: z.string().trim().max(1000).default(""),
});
export type AddStudentCohortMembershipInput = z.infer<typeof AddStudentCohortMembershipInput>;

export const ExitStudentCohortMembershipInput = z.object({
  exitedAt: DateOnlySchema,
  exitReason: StudentCohortExitReasonSchema,
  note: z.string().trim().max(1000).optional(),
});
export type ExitStudentCohortMembershipInput = z.infer<typeof ExitStudentCohortMembershipInput>;

export const AppendStudentProgressionInput = z.object({
  membershipId: z.string().uuid(),
  programmeYear: StudentProgrammeYearSchema,
  academicYear: z.string().trim().min(4).max(20),
  term: z.string().trim().min(1).max(80),
  periodStart: DateOnlySchema,
  periodEnd: DateOnlySchema,
  status: StudentProgressionStatusSchema,
  note: z.string().trim().max(2000).default(""),
}).superRefine((value, ctx) => {
  if (value.periodEnd < value.periodStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEnd"], message: "Period end cannot precede period start" });
  }
});
export type AppendStudentProgressionInput = z.infer<typeof AppendStudentProgressionInput>;

export const ListStudentProgressionQuery = z.object({
  academicYear: z.string().trim().min(4).max(20).optional(),
  term: z.string().trim().min(1).max(80).optional(),
  status: StudentProgressionStatusSchema.optional(),
  programmeYear: StudentProgrammeYearSchema.optional(),
});
export type ListStudentProgressionQuery = z.infer<typeof ListStudentProgressionQuery>;

const PromotionPeriodFields = {
  sourceProgrammeYear: StudentProgrammeYearSchema,
  targetProgrammeYear: StudentProgrammeYearSchema,
  academicYear: z.string().trim().min(4).max(20),
  term: z.string().trim().min(1).max(80),
  periodStart: DateOnlySchema,
  periodEnd: DateOnlySchema,
} as const;

function validatePromotionPeriod(
  value: { sourceProgrammeYear: number; targetProgrammeYear: number; periodStart: string; periodEnd: string },
  ctx: z.RefinementCtx,
) {
  if (value.periodEnd < value.periodStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEnd"], message: "Period end cannot precede period start" });
  }
  if (value.sourceProgrammeYear >= 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceProgrammeYear"], message: "Programme Year 4 uses completion outcomes and cannot be promoted to Year 5" });
  }
  if (value.targetProgrammeYear !== value.sourceProgrammeYear + 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetProgrammeYear"], message: "Target programme year must be exactly one year after the source year" });
  }
}

export const PreviewStudentPromotionInput = z.object(PromotionPeriodFields).superRefine(validatePromotionPeriod);
export type PreviewStudentPromotionInput = z.infer<typeof PreviewStudentPromotionInput>;

export const StudentPromotionDecisionInput = z.object({
  membershipId: z.string().uuid(),
  status: StudentPromotionDecisionSchema,
  note: z.string().trim().max(2000).default(""),
});
export type StudentPromotionDecisionInput = z.infer<typeof StudentPromotionDecisionInput>;

export const ApplyStudentPromotionInput = z.object({
  ...PromotionPeriodFields,
  decisions: z.array(StudentPromotionDecisionInput).min(1),
}).superRefine((value, ctx) => {
  validatePromotionPeriod(value, ctx);
  const seen = new Set<string>();
  value.decisions.forEach((decision, index) => {
    if (seen.has(decision.membershipId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["decisions", index, "membershipId"], message: "Each membership may appear only once" });
    }
    seen.add(decision.membershipId);
  });
});
export type ApplyStudentPromotionInput = z.infer<typeof ApplyStudentPromotionInput>;

export interface StudentPromotionPreviewMember {
  membershipId: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  currentProgrammeYear: StudentProgrammeYear | null;
  proposedStatus: StudentPromotionDecision | null;
  resultingProgrammeYear: StudentProgrammeYear | null;
  eligible: boolean;
  blocker: string | null;
}

export interface StudentPromotionPreview {
  cohortId: string;
  cohortCode: string;
  sourceProgrammeYear: StudentProgrammeYear;
  targetProgrammeYear: StudentProgrammeYear;
  academicYear: string;
  term: string;
  members: StudentPromotionPreviewMember[];
  eligibleCount: number;
  excludedCount: number;
  blockers: string[];
  canApply: boolean;
}

export interface StudentPromotionApplyResult {
  cohortId: string;
  academicYear: string;
  term: string;
  sourceProgrammeYear: StudentProgrammeYear;
  targetProgrammeYear: StudentProgrammeYear;
  recordsCreated: number;
  summary: Record<StudentPromotionDecision, number>;
}

export interface StudentCohortSummaryView {
  id: string;
  programmeId: string;
  code: string;
  name: string;
  intakeYear: number;
  expectedGraduationYear: number;
  status: string;
  _count: { memberships: number };
}

export const STUDENT_COMPLETION_OUTCOME_TYPES = ["ProgrammeCompleted", "GraduationAwarded"] as const;
export const StudentCompletionOutcomeTypeSchema = z.enum(STUDENT_COMPLETION_OUTCOME_TYPES);

export const RecordStudentCompletionOutcomeInput = z.object({
  membershipId: z.string().uuid(),
  outcomeType: StudentCompletionOutcomeTypeSchema,
  outcomeDate: DateOnlySchema,
  academicYear: z.string().trim().min(4).max(20),
  awardName: z.string().trim().max(300).default(""),
  note: z.string().trim().max(2000).default(""),
});
export type RecordStudentCompletionOutcomeInput = z.infer<typeof RecordStudentCompletionOutcomeInput>;

export const ListStudentCompletionOutcomesQuery = z.object({
  outcomeType: StudentCompletionOutcomeTypeSchema.optional(),
  academicYear: z.string().trim().min(4).max(20).optional(),
});
export type ListStudentCompletionOutcomesQuery = z.infer<typeof ListStudentCompletionOutcomesQuery>;
