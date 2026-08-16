import { z } from "zod";

export const CURRICULUM_WORKFLOW_STATUSES = [
  "Draft",
  "UnderReview",
  "Approved",
  "Active",
  "Superseded",
] as const;
export const CurriculumWorkflowStatusSchema = z.enum(CURRICULUM_WORKFLOW_STATUSES);
export type CurriculumWorkflowStatus = z.infer<typeof CurriculumWorkflowStatusSchema>;

export const CURRICULUM_WORKFLOW_ACTIONS = [
  "submit",
  "requestChanges",
  "approve",
  "activate",
] as const;
export const CurriculumWorkflowActionSchema = z.enum(CURRICULUM_WORKFLOW_ACTIONS);
export type CurriculumWorkflowAction = z.infer<typeof CurriculumWorkflowActionSchema>;

export const CurriculumWorkflowCommentSchema = z.object({
  comment: z.string().trim().max(2000).default(""),
}).strict();
export type CurriculumWorkflowCommentInput = z.infer<typeof CurriculumWorkflowCommentSchema>;

export const CurriculumRequestChangesSchema = z.object({
  comment: z.string().trim().min(1, "A reason for requested changes is required").max(2000),
}).strict();
export type CurriculumRequestChangesInput = z.infer<typeof CurriculumRequestChangesSchema>;

export const CurriculumWorkflowStateSchema = z.object({
  curriculumId: z.string().uuid(),
  versionId: z.string().uuid(),
  status: CurriculumWorkflowStatusSchema,
  allowedActions: z.array(CurriculumWorkflowActionSchema),
  lastComment: z.string().nullable(),
});
export type CurriculumWorkflowState = z.infer<typeof CurriculumWorkflowStateSchema>;
