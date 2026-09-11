import { z } from "zod";
import { DateOnlySchema } from "./offerings.ts";

export const OpenTeachingSlotStatusSchema = z.enum([
  "OPEN",
  "CLAIM_REQUESTED",
  "ASSIGNED",
  "CLOSED",
  "EXPIRED",
]);
export type OpenTeachingSlotStatus = z.infer<typeof OpenTeachingSlotStatusSchema>;

export const OpenTeachingSlotClaimStatusSchema = z.enum([
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);
export type OpenTeachingSlotClaimStatus = z.infer<typeof OpenTeachingSlotClaimStatusSchema>;

export const OpenTeachingSlotOfferingOptionSchema = z.object({
  offeringId: z.string().uuid(),
  courseCode: z.string().min(1),
  courseTitle: z.string().min(1),
  sectionCode: z.string().min(1),
  term: z.string().min(1),
}).strict();
export type OpenTeachingSlotOfferingOption = z.infer<typeof OpenTeachingSlotOfferingOptionSchema>;

export const OpenTeachingSlotViewSchema = z.object({
  id: z.string().uuid(),
  programmeId: z.string().min(1),
  status: OpenTeachingSlotStatusSchema,
  sourceOccurrenceId: z.string().uuid(),
  sessionDate: DateOnlySchema,
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  room: z.string().nullable(),
  activityType: z.string().min(1),
  sourceCourseCode: z.string().min(1),
  sourceCourseTitle: z.string().min(1),
  sectionCode: z.string().min(1),
  eligibleOfferings: z.array(OpenTeachingSlotOfferingOptionSchema),
}).strict();
export type OpenTeachingSlotView = z.infer<typeof OpenTeachingSlotViewSchema>;

export const SubmitOpenTeachingSlotClaimSchema = z.object({
  targetOfferingId: z.string().uuid(),
}).strict();
export type SubmitOpenTeachingSlotClaim = z.infer<typeof SubmitOpenTeachingSlotClaimSchema>;

export const ReviewOpenTeachingSlotClaimSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1500).optional(),
}).strict();
export type ReviewOpenTeachingSlotClaim = z.infer<typeof ReviewOpenTeachingSlotClaimSchema>;

export const OpenTeachingSlotClaimViewSchema = z.object({
  id: z.string().uuid(),
  slotId: z.string().uuid(),
  status: OpenTeachingSlotClaimStatusSchema,
  claimant: z.object({ id: z.string().uuid(), name: z.string().min(1) }).strict(),
  targetOffering: OpenTeachingSlotOfferingOptionSchema,
  slot: z.object({
    sessionDate: DateOnlySchema,
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    room: z.string().nullable(),
    sourceCourseCode: z.string().min(1),
    sourceCourseTitle: z.string().min(1),
    sectionCode: z.string().min(1),
  }).strict(),
  reviewedBy: z.object({ id: z.string().uuid(), name: z.string().min(1) }).strict().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  reviewComment: z.string(),
  requestedAt: z.string().datetime(),
  confirmedOccurrenceId: z.string().uuid().nullable(),
}).strict();
export type OpenTeachingSlotClaimView = z.infer<typeof OpenTeachingSlotClaimViewSchema>;

export const OpenTeachingSlotStudentAssignmentSchema = z.object({
  occurrenceId: z.string().uuid(),
  slotId: z.string().uuid(),
  offeringId: z.string().uuid(),
  courseCode: z.string().min(1),
  courseTitle: z.string().min(1),
  sectionCode: z.string().min(1),
  lecturerName: z.string().min(1),
  sessionDate: DateOnlySchema,
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  room: z.string().nullable(),
  activityType: z.string().min(1),
  kind: z.literal("reused-slot"),
}).strict();
export type OpenTeachingSlotStudentAssignment = z.infer<typeof OpenTeachingSlotStudentAssignmentSchema>;

export const OpenTeachingSlotClaimReviewResultSchema = z.object({
  claim: OpenTeachingSlotClaimViewSchema,
  changed: z.boolean(),
  notifications: z.object({
    claimant: z.enum(["sent", "missing", "failed", "duplicate"]),
    students: z.object({
      sent: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      duplicate: z.number().int().nonnegative(),
      missing: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
}).strict();
export type OpenTeachingSlotClaimReviewResult = z.infer<typeof OpenTeachingSlotClaimReviewResultSchema>;
