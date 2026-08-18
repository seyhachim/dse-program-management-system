import { z } from "zod";

export const CourseSpecPeriodicReviewOutcomeSchema = z.enum([
  "Reaffirmed",
  "MinorRevision",
  "MajorRevision",
]);
export type CourseSpecPeriodicReviewOutcome = z.infer<
  typeof CourseSpecPeriodicReviewOutcomeSchema
>;

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const CreateCourseSpecPeriodicReviewSchema = z
  .object({
    courseSpecId: z.string().uuid(),
    reviewedAt: IsoDateSchema,
    evidenceSummary: z.string().trim().min(3).max(5000),
    decisionReason: z.string().trim().min(3).max(5000),
    outcome: CourseSpecPeriodicReviewOutcomeSchema,
    changeSummary: z.string().trim().max(5000).default(""),
  })
  .superRefine((value, ctx) => {
    if (
      value.outcome !== "Reaffirmed" &&
      value.changeSummary.trim().length < 3
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["changeSummary"],
        message: "A revision outcome requires a change summary",
      });
    }
  });
export type CreateCourseSpecPeriodicReviewInput = z.infer<
  typeof CreateCourseSpecPeriodicReviewSchema
>;

export const ListDueCourseSpecReviewsQuerySchema = z.object({
  programmeId: z.string().min(1),
  asOf: IsoDateSchema.optional(),
});
export type ListDueCourseSpecReviewsQuery = z.infer<
  typeof ListDueCourseSpecReviewsQuerySchema
>;

export type CourseSpecPeriodicReviewView = {
  id: string;
  courseSpecId: string;
  reviewerId: string;
  scheduledDueAt: string | null;
  reviewedAt: string;
  evidenceSummary: string;
  decisionReason: string;
  outcome: CourseSpecPeriodicReviewOutcome;
  createdRevisionId: string | null;
  nextReviewDueAt: string | null;
  createdAt: string;
};

export type DueCourseSpecReviewView = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseSpecId: string;
  academicVersion: string;
  effectiveDueAt: string;
  daysOverdue: number;
};
