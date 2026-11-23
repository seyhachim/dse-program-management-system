import { z } from "zod";
import { DateOnlySchema } from "./offerings.ts";

const ClockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour) format");

export const ProposeMakeUpClassSchema = z.object({
  offeringId: z.string().uuid(),
  offeringMeetingId: z.string().uuid(),
  originalDate: DateOnlySchema,
  replacementDate: DateOnlySchema,
  startTime: ClockSchema,
  endTime: ClockSchema,
  room: z.string().trim().max(100).optional(),
  note: z.string().trim().min(1).max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.replacementDate <= value.originalDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["replacementDate"], message: "Make-up must take place after the missed class" });
  }
  if (value.endTime <= value.startTime) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "End time must be after start time" });
  }
});
export type ProposeMakeUpClass = z.infer<typeof ProposeMakeUpClassSchema>;

export const ReviewMakeUpClassSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  confirmedMissed: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.decision === "APPROVE" && value.confirmedMissed !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmedMissed"], message: "Reviewer must verify the original class needs recovery" });
  }
});
export type ReviewMakeUpClass = z.infer<typeof ReviewMakeUpClassSchema>;

export interface MakeUpClassView {
  id: string;
  offeringId: string;
  offeringMeetingId: string;
  originalOccurrenceId: string;
  originalDate: string;
  replacementDate: string;
  startTime: string;
  endTime: string;
  room: string | null;
  note: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  proposedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
  courseCode: string;
  sectionCode: string;
}

/** No private request notes are returned to Roll Call. */
export type ApprovedMakeUpAttendanceDate = Pick<
  MakeUpClassView, "id" | "offeringId" | "replacementDate" | "originalDate" | "startTime" | "endTime" | "room"
>;
