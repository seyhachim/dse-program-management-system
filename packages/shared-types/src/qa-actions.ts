import { z } from "zod";

export const QaImprovementActionStatusSchema = z.enum([
  "open",
  "inProgress",
  "completed",
  "cancelled",
]);

export const CreateQaImprovementActionSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid(),
  analysisId: z.string().uuid(),
  reviewId: z.string().uuid(),
  ownerId: z.string().uuid().nullable().optional().default(null),
  plannedAction: z.string().trim().min(10).max(5000),
  indicator: z.string().trim().min(5).max(1000),
  dueDate: z.coerce.date().nullable().optional().default(null),
});

export const UpdateQaImprovementActionSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    ownerId: z.string().uuid().nullable().optional(),
    plannedAction: z.string().trim().min(10).max(5000).optional(),
    indicator: z.string().trim().min(5).max(1000).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    status: QaImprovementActionStatusSchema.optional(),
    result: z.string().trim().max(5000).optional(),
    effectivenessReview: z.string().trim().max(5000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "completed" || value.status === "cancelled") {
      if ((value.result?.length ?? 0) < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Closing an improvement action requires a result/closure explanation",
          path: ["result"],
        });
      }
      if ((value.effectivenessReview?.length ?? 0) < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Closing an improvement action requires an effectiveness review",
          path: ["effectivenessReview"],
        });
      }
    }
  });

export const CarryForwardQaImprovementActionSchema = z.object({
  programmeId: z.string().trim().min(1),
  targetCycleId: z.string().uuid(),
  ownerId: z.string().uuid().nullable().optional().default(null),
  dueDate: z.coerce.date().nullable().optional().default(null),
});

export const QaImprovementActionListQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid().optional(),
  status: QaImprovementActionStatusSchema.optional(),
});

export type QaImprovementActionStatus = z.infer<typeof QaImprovementActionStatusSchema>;
export type CreateQaImprovementActionInput = z.infer<typeof CreateQaImprovementActionSchema>;
export type UpdateQaImprovementActionInput = z.infer<typeof UpdateQaImprovementActionSchema>;
export type CarryForwardQaImprovementActionInput = z.infer<typeof CarryForwardQaImprovementActionSchema>;

export interface QaImprovementActionView {
  id: string;
  programmeId: string;
  cycleId: string;
  requirementCode: string;
  analysisId: string;
  reviewId: string;
  ownerId: string | null;
  ownerName: string | null;
  plannedAction: string;
  indicator: string;
  dueDate: string | null;
  status: QaImprovementActionStatus;
  result: string;
  effectivenessReview: string;
  completedAt: string | null;
  carriedFromActionId: string | null;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}


export const CreateQaImprovementActionFollowUpSchema = z.object({
  programmeId: z.string().trim().min(1),
  evidenceId: z.string().uuid(),
  note: z.string().trim().max(2000).default(""),
});
export type CreateQaImprovementActionFollowUpInput = z.infer<typeof CreateQaImprovementActionFollowUpSchema>;

export const QaImprovementActionFollowUpListQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export interface QaImprovementActionFollowUpView {
  id: string;
  programmeId: string;
  actionId: string;
  evidenceId: string;
  evidenceTitle: string;
  evidenceStatus: "draft" | "ready" | "reviewed";
  note: string;
  linkedById: string;
  linkedAt: string;
}
