import { z } from "zod";

export const PeriodicReviewOutcomeSchema = z.enum([
  "Reaffirmed",
  "MinorRevision",
  "MajorRevision",
]);
export type PeriodicReviewOutcome = z.infer<typeof PeriodicReviewOutcomeSchema>;

export const CreateCourseSpecPeriodicReviewSchema = z.object({
  scheduledReviewAt: z.coerce.date(),
  reviewedAt: z.coerce.date(),
  evidenceSummary: z.string().trim().min(10).max(5000),
  decisionReason: z.string().trim().min(10).max(5000),
  outcome: PeriodicReviewOutcomeSchema,
  nextReviewDueAt: z.coerce.date(),
}).superRefine((value, ctx) => {
  if (value.nextReviewDueAt <= value.reviewedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nextReviewDueAt"],
      message: "Next review date must be after the completed review date",
    });
  }
});
export type CreateCourseSpecPeriodicReview = z.infer<
  typeof CreateCourseSpecPeriodicReviewSchema
>;

export const CourseSpecPeriodicReviewViewSchema = z.object({
  id: z.string().uuid(),
  courseSpecId: z.string().uuid(),
  courseId: z.string().uuid(),
  courseCode: z.string(),
  courseTitle: z.string(),
  versionMajor: z.number().int().positive(),
  versionMinor: z.number().int().nonnegative(),
  reviewerId: z.string().uuid(),
  reviewerName: z.string(),
  scheduledReviewAt: z.string().datetime(),
  reviewedAt: z.string().datetime(),
  evidenceSummary: z.string(),
  decisionReason: z.string(),
  outcome: PeriodicReviewOutcomeSchema,
  createdRevisionId: z.string().uuid().nullable(),
  createdRevisionVersion: z.string().nullable(),
  nextReviewDueAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type CourseSpecPeriodicReviewView = z.infer<
  typeof CourseSpecPeriodicReviewViewSchema
>;

export const CourseSpecReviewDueQuerySchema = z.object({
  asOf: z.coerce.date().optional(),
  includeFutureDays: z.coerce.number().int().min(0).max(3650).default(0),
});
export type CourseSpecReviewDueQuery = z.infer<typeof CourseSpecReviewDueQuerySchema>;

export const CourseSpecReviewDueViewSchema = z.object({
  courseId: z.string().uuid(),
  courseCode: z.string(),
  courseTitle: z.string(),
  programmeId: z.string(),
  courseSpecId: z.string().uuid(),
  versionMajor: z.number().int().positive(),
  versionMinor: z.number().int().nonnegative(),
  approvedAt: z.string().datetime().nullable(),
  effectiveReviewDueAt: z.string().datetime(),
  latestPeriodicReviewAt: z.string().datetime().nullable(),
  latestPeriodicOutcome: PeriodicReviewOutcomeSchema.nullable(),
  status: z.enum(["Due", "Overdue"]),
  daysFromDue: z.number().int(),
});
export type CourseSpecReviewDueView = z.infer<typeof CourseSpecReviewDueViewSchema>;
