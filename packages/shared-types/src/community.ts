import { z } from "zod";

export const CommunityLeadership = z.enum(["StudentLed", "LecturerLed", "Mixed"]);
export type CommunityLeadership = z.infer<typeof CommunityLeadership>;

export const CommunityDiscussionStatus = z.enum([
  "Discussing",
  "Agreed",
  "Implementing",
  "Evaluated",
]);
export type CommunityDiscussionStatus = z.infer<typeof CommunityDiscussionStatus>;

export const CommunityActionStatus = z.enum([
  "Proposed",
  "Agreed",
  "Implementing",
  "Evaluated",
]);
export type CommunityActionStatus = z.infer<typeof CommunityActionStatus>;

export const CreateCommunitySchema = z.object({
  programmeId: z.string().trim().min(1),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  category: z.string().trim().min(2).max(80),
  leadership: CommunityLeadership,
});
export type CreateCommunityInput = z.infer<typeof CreateCommunitySchema>;

export const CreateCommunityDiscussionSchema = z.object({
  title: z.string().trim().min(5).max(180),
  body: z.string().trim().min(10).max(5000),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
});
export type CreateCommunityDiscussionInput = z.infer<typeof CreateCommunityDiscussionSchema>;

export const CreateCommunityCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type CreateCommunityCommentInput = z.infer<typeof CreateCommunityCommentSchema>;

export const CreateCommunityActionSchema = z.object({
  summary: z.string().trim().min(5).max(500),
  ownerId: z.string().uuid().optional(),
  relatedCourseId: z.string().uuid().optional(),
});
export type CreateCommunityActionInput = z.infer<typeof CreateCommunityActionSchema>;

export const UpdateCommunityActionStatusSchema = z.object({
  status: CommunityActionStatus,
});
export type UpdateCommunityActionStatusInput = z.infer<typeof UpdateCommunityActionStatusSchema>;

export interface CommunityView {
  id: string;
  programmeId: string;
  name: string;
  description: string;
  category: string;
  leadership: CommunityLeadership;
  active: boolean;
  memberCount: number;
  discussionCount: number;
  implementedActionCount: number;
  isMember: boolean;
  createdAt: string;
}

export interface CommunityDiscussionSummaryView {
  id: string;
  communityId: string;
  title: string;
  body: string;
  status: CommunityDiscussionStatus;
  tags: string[];
  authorId: string;
  authorName: string;
  commentCount: number;
  actionCount: number;
  createdAt: string;
}

export interface CommunityCommentView {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface CommunityActionView {
  id: string;
  discussionId: string;
  summary: string;
  status: CommunityActionStatus;
  ownerId: string | null;
  ownerName: string | null;
  relatedCourseId: string | null;
  relatedCourseCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityDiscussionDetailView extends CommunityDiscussionSummaryView {
  comments: CommunityCommentView[];
  actions: CommunityActionView[];
}
