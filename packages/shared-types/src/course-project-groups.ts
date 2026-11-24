import { z } from "zod";

/** Registration is a proposal, never an academic group or grade. */
export const CourseProjectGroupPolicyInput = z.object({
  enabled: z.boolean(),
  maxGroups: z.number().int().min(1).max(100),
  minMembers: z.number().int().min(2).max(30),
  maxMembers: z.number().int().min(2).max(30),
  deadlineAt: z.string().datetime({ offset: true }),
}).strict().refine((value) => value.minMembers <= value.maxMembers, {
  path: ["maxMembers"], message: "Maximum size must not be less than minimum size",
});
export type CourseProjectGroupPolicyInput = z.infer<typeof CourseProjectGroupPolicyInput>;

export const CourseProjectGroupActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal("invite"), proposalId: z.string().uuid(), enrollmentId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("accept"), proposalId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("decline"), proposalId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("withdraw"), proposalId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("cancel"), proposalId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("submit"), proposalId: z.string().uuid() }).strict(),
]);
export type CourseProjectGroupActionInput = z.infer<typeof CourseProjectGroupActionInput>;

export const CourseProjectGroupReviewInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), proposalId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("return"), proposalId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }).strict(),
]);
export type CourseProjectGroupReviewInput = z.infer<typeof CourseProjectGroupReviewInput>;

export type CourseProjectGroupProposal = {
  id: string;
  name: string;
  leaderEnrollmentId: string;
  status: "draft" | "submitted" | "approved" | "cancelled";
  members: Array<{ enrollmentId: string; status: "pending" | "accepted" | "declined" }>;
  reviewReason?: string;
  academicGroupId?: string;
};
