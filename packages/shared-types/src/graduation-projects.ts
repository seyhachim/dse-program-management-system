import { z } from "zod";

export const GraduationProjectStatusSchema = z.enum(["Proposed", "Active", "Completed", "Archived"]);
export type GraduationProjectStatus = z.infer<typeof GraduationProjectStatusSchema>;
export const GraduationProjectMemberRoleSchema = z.enum(["Lead", "Member"]);
export type GraduationProjectMemberRole = z.infer<typeof GraduationProjectMemberRoleSchema>;
export const GraduationProjectAdvisorRoleSchema = z.enum(["Primary", "CoAdvisor"]);
export type GraduationProjectAdvisorRole = z.infer<typeof GraduationProjectAdvisorRoleSchema>;
export const GraduationProjectPhaseKindSchema = z.enum(["FPR401", "FPR402", "THE402", "INT402"]);
export type GraduationProjectPhaseKind = z.infer<typeof GraduationProjectPhaseKindSchema>;
export const GraduationProjectPhaseStatusSchema = z.enum(["Planned", "Active", "Completed"]);
export type GraduationProjectPhaseStatus = z.infer<typeof GraduationProjectPhaseStatusSchema>;
export const GraduationProjectMilestoneStatusSchema = z.enum(["Planned", "Open", "Submitted", "Reviewed", "Completed"]);
export type GraduationProjectMilestoneStatus = z.infer<typeof GraduationProjectMilestoneStatusSchema>;
export const GraduationProjectReviewDecisionSchema = z.enum(["ChangesRequested", "Approved"]);
export type GraduationProjectReviewDecision = z.infer<typeof GraduationProjectReviewDecisionSchema>;

export const CreateGraduationProjectInput = z.object({
  programmeId: z.string().trim().min(1),
  cohortId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  abstract: z.string().trim().max(5000).default(""),
  memberStudentIds: z.array(z.string().uuid()).min(1).max(12).superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate project member" });
  }),
  leadStudentId: z.string().uuid().optional(),
});
export type CreateGraduationProjectInput = z.infer<typeof CreateGraduationProjectInput>;

export const AssignGraduationProjectAdvisorInput = z.object({ lecturerId: z.string().uuid(), role: GraduationProjectAdvisorRoleSchema });
export type AssignGraduationProjectAdvisorInput = z.infer<typeof AssignGraduationProjectAdvisorInput>;
export const EndGraduationProjectAdvisorInput = z.object({ reason: z.string().trim().max(1000).default("") });
export type EndGraduationProjectAdvisorInput = z.infer<typeof EndGraduationProjectAdvisorInput>;
export const AddGraduationProjectPhaseInput = z.object({ offeringId: z.string().uuid(), kind: GraduationProjectPhaseKindSchema, status: GraduationProjectPhaseStatusSchema.default("Planned") });
export type AddGraduationProjectPhaseInput = z.infer<typeof AddGraduationProjectPhaseInput>;
export const CreateGraduationProjectMilestoneInput = z.object({ phaseId: z.string().uuid().nullable().optional(), title: z.string().trim().min(1).max(300), description: z.string().trim().max(5000).default(""), dueAt: z.string().datetime().nullable().optional(), sortOrder: z.number().int().min(0).default(0) });
export type CreateGraduationProjectMilestoneInput = z.infer<typeof CreateGraduationProjectMilestoneInput>;
export const SubmitGraduationProjectMilestoneInput = z.object({ artifactUrl: z.string().trim().min(1).max(2000), notes: z.string().trim().max(5000).default("") });
export type SubmitGraduationProjectMilestoneInput = z.infer<typeof SubmitGraduationProjectMilestoneInput>;
export const ReviewGraduationProjectSubmissionInput = z.object({ decision: GraduationProjectReviewDecisionSchema, comment: z.string().trim().max(5000).default("") });
export type ReviewGraduationProjectSubmissionInput = z.infer<typeof ReviewGraduationProjectSubmissionInput>;
export const CreateGraduationProjectMeetingInput = z.object({ occurredAt: z.string().datetime(), discussion: z.string().trim().max(10000).default(""), recommendations: z.string().trim().max(10000).default(""), nextActions: z.string().trim().max(10000).default("") });
export type CreateGraduationProjectMeetingInput = z.infer<typeof CreateGraduationProjectMeetingInput>;

export interface GraduationProjectMemberView { studentId: string; studentNumber: string; studentName: string; role: GraduationProjectMemberRole; joinedAt: string }
export interface GraduationProjectAdvisorView { id: string; lecturerId: string; lecturerName: string; role: GraduationProjectAdvisorRole; assignedAt: string; endedAt: string | null; endReason: string }
export interface GraduationProjectPhaseView { id: string; offeringId: string; courseCode: string; courseTitle: string; term: string; kind: GraduationProjectPhaseKind; status: GraduationProjectPhaseStatus; startedAt: string | null; completedAt: string | null; createdAt: string }
export interface GraduationProjectReviewView { id: string; reviewerId: string; reviewerName: string; decision: GraduationProjectReviewDecision; comment: string; createdAt: string }
export interface GraduationProjectSubmissionView { id: string; milestoneId: string; version: number; submittedByStudentId: string; submittedByStudentName: string; artifactUrl: string; notes: string; submittedAt: string; reviews: GraduationProjectReviewView[] }
export interface GraduationProjectMilestoneView { id: string; projectId: string; phaseId: string | null; title: string; description: string; dueAt: string | null; status: GraduationProjectMilestoneStatus; sortOrder: number; createdAt: string; submissions: GraduationProjectSubmissionView[] }
export interface GraduationProjectMeetingView { id: string; projectId: string; occurredAt: string; discussion: string; recommendations: string; nextActions: string; createdById: string; createdByName: string; createdAt: string }
export interface GraduationProjectSummary { id: string; programmeId: string; cohortId: string | null; title: string; abstract: string; status: GraduationProjectStatus; createdAt: string; updatedAt: string; members: GraduationProjectMemberView[]; advisors: GraduationProjectAdvisorView[]; phases: GraduationProjectPhaseView[] }
export interface GraduationProjectDetail extends GraduationProjectSummary { milestones: GraduationProjectMilestoneView[]; meetings: GraduationProjectMeetingView[] }
export interface GraduationProjectAdvisorWorkload { lecturerId: string; lecturerName: string; activeProjectCount: number; primaryProjectCount: number; coAdvisorProjectCount: number }
