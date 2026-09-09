import { z } from "zod";
import { DateOnlySchema, MeetingDaySchema, MeetingActivityTypeSchema } from "./offerings.ts";

export const TEACHING_LEAVE_TYPES = [
  "SICK",
  "PERSONAL",
  "OFFICIAL_DUTY",
  "EMERGENCY",
  "OTHER",
] as const;
export const TeachingLeaveTypeSchema = z.enum(TEACHING_LEAVE_TYPES);
export type TeachingLeaveType = z.infer<typeof TeachingLeaveTypeSchema>;

export const TEACHING_LEAVE_HANDLINGS = [
  "CANCEL",
  "RESCHEDULE",
  "MAKE_UP",
  "OPEN_SLOT",
  "OTHER",
] as const;
export const TeachingLeaveHandlingSchema = z.enum(TEACHING_LEAVE_HANDLINGS);
export type TeachingLeaveHandling = z.infer<typeof TeachingLeaveHandlingSchema>;

export const TEACHING_LEAVE_STATUSES = [
  "PENDING",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export const TeachingLeaveStatusSchema = z.enum(TEACHING_LEAVE_STATUSES);
export type TeachingLeaveStatus = z.infer<typeof TeachingLeaveStatusSchema>;

export const TEACHING_LEAVE_REVIEW_DECISIONS = [
  "APPROVE",
  "REJECT",
  "REQUEST_CHANGES",
] as const;
export const TeachingLeaveReviewDecisionSchema = z.enum(TEACHING_LEAVE_REVIEW_DECISIONS);
export type TeachingLeaveReviewDecision = z.infer<typeof TeachingLeaveReviewDecisionSchema>;

const LeaveOccurrenceInputSchema = z.object({
  offeringId: z.string().uuid(),
  offeringMeetingId: z.string().uuid(),
  date: DateOnlySchema,
  releaseForReuse: z.boolean().default(false),
}).strict();
export type TeachingLeaveOccurrenceInput = z.infer<typeof LeaveOccurrenceInputSchema>;

const TeachingLeaveEditableFieldsSchema = z.object({
  leaveType: TeachingLeaveTypeSchema,
  confidentialReason: z.string().trim().min(1, "Reason is required").max(2000),
  attachmentRef: z.string().trim().max(500).optional(),
  proposedHandling: TeachingLeaveHandlingSchema,
  proposedNote: z.string().trim().max(1000).optional(),
}).strict();

export const SubmitTeachingLeaveRequestSchema = TeachingLeaveEditableFieldsSchema.extend({
  occurrences: z.array(LeaveOccurrenceInputSchema).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  const keys = value.occurrences.map((item) => `${item.offeringMeetingId}:${item.date}`);
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences"], message: "Do not submit the same teaching session twice" });
  }
});
export type SubmitTeachingLeaveRequest = z.infer<typeof SubmitTeachingLeaveRequestSchema>;

/** Requester-only edit after a reviewer explicitly requests changes. Exact session scope stays immutable. */
export const ReviseTeachingLeaveRequestSchema = TeachingLeaveEditableFieldsSchema;
export type ReviseTeachingLeaveRequest = z.infer<typeof ReviseTeachingLeaveRequestSchema>;

export const ReviewTeachingLeaveRequestSchema = z.object({
  decision: TeachingLeaveReviewDecisionSchema,
  comment: z.string().trim().max(1500).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.decision === "REQUEST_CHANGES" && !value.comment) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["comment"],
      message: "Reviewer guidance is required when requesting changes",
    });
  }
});
export type ReviewTeachingLeaveRequest = z.infer<typeof ReviewTeachingLeaveRequestSchema>;

export const TeachingLeaveOccurrenceViewSchema = z.object({
  occurrenceId: z.string().uuid(),
  offeringId: z.string().uuid(),
  offeringMeetingId: z.string().uuid(),
  sessionDate: DateOnlySchema,
  scheduledDayOfWeek: MeetingDaySchema,
  scheduledStartTime: z.string(),
  scheduledEndTime: z.string(),
  scheduledRoom: z.string().nullable(),
  scheduledActivityType: MeetingActivityTypeSchema,
  releaseForReuse: z.boolean(),
  course: z.object({ code: z.string(), title: z.string() }).strict(),
  sectionCode: z.string(),
}).strict();
export type TeachingLeaveOccurrenceView = z.infer<typeof TeachingLeaveOccurrenceViewSchema>;

/** Private requester/manager projection. Never return this schema to students or group broadcasts. */
export const TeachingLeaveRequestViewSchema = z.object({
  id: z.string().uuid(),
  programmeId: z.string(),
  requester: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
  leaveType: TeachingLeaveTypeSchema,
  confidentialReason: z.string(),
  attachmentRef: z.string().nullable(),
  proposedHandling: TeachingLeaveHandlingSchema,
  proposedNote: z.string(),
  noticeHours: z.number().int().positive(),
  submittedLate: z.boolean(),
  status: TeachingLeaveStatusSchema,
  reviewedBy: z.object({ id: z.string().uuid(), name: z.string() }).strict().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  reviewComment: z.string(),
  submittedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  occurrences: z.array(TeachingLeaveOccurrenceViewSchema),
}).strict();
export type TeachingLeaveRequestView = z.infer<typeof TeachingLeaveRequestViewSchema>;

/** Privacy-safe schedule-impact projection usable by student/group notification code. */
export const TeachingLeaveOperationalImpactSchema = z.object({
  requestId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  offeringId: z.string().uuid(),
  programmeId: z.string(),
  courseCode: z.string(),
  courseTitle: z.string(),
  sectionCode: z.string(),
  sessionDate: DateOnlySchema,
  startTime: z.string(),
  endTime: z.string(),
  room: z.string().nullable(),
  releaseForReuse: z.boolean(),
  proposedHandling: TeachingLeaveHandlingSchema,
}).strict();
export type TeachingLeaveOperationalImpact = z.infer<typeof TeachingLeaveOperationalImpactSchema>;

export interface TeachingLeaveReviewResult {
  request: TeachingLeaveRequestView;
  changed: boolean;
  notifications: {
    requester: "sent" | "missing" | "failed" | "duplicate";
    students: { sent: number; failed: number; duplicate: number; missing: number };
    lecturerGroup: Array<{ occurrenceId: string; status: "sent" | "missing" | "failed" | "duplicate" }>;
  };
}
