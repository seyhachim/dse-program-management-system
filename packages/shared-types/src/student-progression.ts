import { z } from "zod";

export const STUDENT_COHORT_STATUSES = ["Planned", "Active", "Completed", "Archived"] as const;
export const StudentCohortStatusSchema = z.enum(STUDENT_COHORT_STATUSES);

export const STUDENT_PROGRESSION_STATUSES = [
  "Progressed", "Retained", "Withdrawn", "Inactive", "Graduated", "Transferred",
] as const;
export const StudentProgressionStatusSchema = z.enum(STUDENT_PROGRESSION_STATUSES);

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
});
export type ListStudentProgressionQuery = z.infer<typeof ListStudentProgressionQuery>;
