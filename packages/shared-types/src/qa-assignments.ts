import { z } from "zod";

export const QaRequirementAssignmentScopeSchema = z.object({
  programmeId: z.string().trim().min(1),
});

export const UpsertQaRequirementAssignmentSchema = z.object({
  programmeId: z.string().trim().min(1),
  assigneeId: z.string().uuid(),
});

export type QaRequirementAssignmentScope = z.infer<
  typeof QaRequirementAssignmentScopeSchema
>;
export type UpsertQaRequirementAssignmentInput = z.infer<
  typeof UpsertQaRequirementAssignmentSchema
>;

export interface QaRequirementAssignmentView {
  id: string;
  programmeId: string;
  cycleId: string;
  criterionCode: string;
  criterionTitle: string;
  requirementCode: string;
  requirementTitle: string;
  assignee: {
    id: string;
    name: string;
    email: string;
  };
  assignedBy: {
    id: string;
    name: string;
  };
  assignedAt: string;
  updatedAt: string;
}
